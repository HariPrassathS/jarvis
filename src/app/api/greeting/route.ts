// ──────────────────────────────────────────────
// Contextual Dynamic Greeting API Route — Real-Time Personalized Boot Salutation
// Synthesizes greeting from: Time of Day + Proactive Time-Sensitive Check-ins + Recent Topic + Calendar Schedule
// ──────────────────────────────────────────────

export const dynamic = 'force-dynamic';
export const maxDuration = 10;

import { NextRequest, NextResponse } from 'next/server';
import { verifyIdToken } from '@/lib/firebase-admin';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { jarvisCache } from '@/lib/llm/cache';
import { recallMemories, markMemoryFollowedUp } from '@/lib/tools/memory';
import type { VoicePersona } from '@/types';

interface CalendarSummary {
  summary: string;
  timeStr: string;
}

export async function GET(req: NextRequest) {
  try {
    // 1. Authenticate user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized: Missing token' }, { status: 401 });
    }

    const idToken = authHeader.slice(7);
    let decoded;
    try {
      decoded = await verifyIdToken(idToken);
    } catch {
      return NextResponse.json({ error: 'Unauthorized: Invalid token' }, { status: 401 });
    }

    const profileUid = decoded.uid;
    const personaParam = (req.nextUrl.searchParams.get('persona') as VoicePersona) || 'jarvis';
    const isFriday = personaParam === 'friday';
    const googleAccessToken = req.headers.get('x-google-access-token') || undefined;

    // 2. Resolve Profile
    const supabase = createServerSupabaseClient();
    let displayName = decoded.name || decoded.email?.split('@')[0] || 'Operator';
    let profileId = profileUid;

    const profileCacheKey = `profile:${profileUid}`;
    const cachedProfile = jarvisCache.get<{ id: string; display_name: string }>(profileCacheKey);

    if (cachedProfile) {
      displayName = cachedProfile.display_name;
      profileId = cachedProfile.id;
    } else {
      try {
        const { data: existingProfile } = await supabase
          .from('profiles')
          .select('id, display_name')
          .eq('firebase_uid', profileUid)
          .maybeSingle();

        if (existingProfile) {
          displayName = existingProfile.display_name;
          profileId = existingProfile.id;
          jarvisCache.set(profileCacheKey, existingProfile, 600000);
        }
      } catch (err) {
        console.warn('[Greeting API] Profile lookup fallback:', err);
      }
    }

    const firstName = displayName.split(' ')[0] || displayName;

    // 3. Time of Day Calculation
    const now = new Date();
    const hour = now.getHours();
    let timeGreetingJarvis = 'day';
    let timeGreetingFriday = 'day';

    if (hour >= 5 && hour < 12) {
      timeGreetingJarvis = 'morning';
      timeGreetingFriday = 'morning';
    } else if (hour >= 12 && hour < 17) {
      timeGreetingJarvis = 'afternoon';
      timeGreetingFriday = 'afternoon';
    } else if (hour >= 17 && hour < 22) {
      timeGreetingJarvis = 'evening';
      timeGreetingFriday = 'evening';
    } else {
      timeGreetingJarvis = 'evening';
      timeGreetingFriday = 'late night';
    }

    // 4. Proactive Fact-Based Check-in (Time-Sensitive Facts, capped at 1 per session)
    let proactiveFactGreeting: string | null = null;
    try {
      const memories = await recallMemories(profileId);
      const pending = memories.find((m) => m.follow_up_relevant && !m.followed_up);
      if (pending) {
        const topic = pending.topic || pending.key.replace(/_/g, ' ');
        if (isFriday) {
          proactiveFactGreeting = `Hey ${firstName}! Good ${timeGreetingFriday}. Quick check-in, boss — wasn't the ${topic} on your docket? How did everything go?`;
        } else {
          proactiveFactGreeting = `Good ${timeGreetingJarvis}, ${firstName}. If I may inquire, sir — wasn't the ${topic} scheduled recently? How did it go?`;
        }
        // Mark as followed up so it surfaces exactly ONCE across sessions
        await markMemoryFollowedUp(profileId, pending.id);
      }
    } catch (memErr) {
      console.warn('[Greeting API] Proactive memory check warning:', memErr);
    }

    // 5. Fetch Recent Dialogue Context (last 48 hours)
    let recentTopic: string | null = null;
    try {
      const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

      const { data: latestConv } = await supabase
        .from('conversations')
        .select('id, title, updated_at, created_at')
        .eq('profile_id', profileId)
        .gte('created_at', fortyEightHoursAgo)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestConv) {
        const { data: lastMsgs } = await supabase
          .from('messages')
          .select('content, role')
          .eq('conversation_id', latestConv.id)
          .eq('role', 'user')
          .order('created_at', { ascending: false })
          .limit(1);

        if (lastMsgs && lastMsgs.length > 0 && lastMsgs[0].content) {
          const rawContent = lastMsgs[0].content.trim();
          let cleaned = rawContent.replace(/^[!?.,\s]+|[!?.,\s]+$/g, '');
          if (cleaned.length > 45) {
            cleaned = cleaned.slice(0, 42) + '...';
          }
          if (cleaned.length > 3) {
            recentTopic = cleaned;
          }
        } else if (latestConv.title && latestConv.title !== 'Active Dialogue') {
          recentTopic = latestConv.title;
        }
      }
    } catch (dbErr) {
      console.warn('[Greeting API] Recent conversation check:', dbErr);
    }

    // 6. Fetch Today's Calendar Event (if token provided)
    let todayEvent: CalendarSummary | null = null;
    if (googleAccessToken) {
      try {
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
        const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

        const calUrl = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events');
        calUrl.searchParams.set('timeMin', startOfDay.toISOString());
        calUrl.searchParams.set('timeMax', endOfDay.toISOString());
        calUrl.searchParams.set('singleEvents', 'true');
        calUrl.searchParams.set('orderBy', 'startTime');
        calUrl.searchParams.set('maxResults', '5');

        const calRes = await fetch(calUrl.toString(), {
          headers: {
            Authorization: `Bearer ${googleAccessToken}`,
            Accept: 'application/json',
          },
        });

        if (calRes.ok) {
          const calData = await calRes.json();
          const items = Array.isArray(calData.items) ? calData.items : [];
          const active = items.filter((item: any) => item.status !== 'cancelled');

          if (active.length > 0) {
            const firstEvt = active[0];
            const summary = firstEvt.summary || 'an agenda item';
            let timeStr = 'today';
            if (firstEvt.start?.dateTime) {
              const dt = new Date(firstEvt.start.dateTime);
              timeStr = new Intl.DateTimeFormat('en-US', {
                hour: 'numeric',
                minute: 'numeric',
                hour12: true,
              }).format(dt);
            } else if (firstEvt.start?.date) {
              timeStr = 'all-day';
            }
            todayEvent = { summary, timeStr };
          }
        }
      } catch (calErr) {
        console.warn('[Greeting API] Calendar fetch warning:', calErr);
      }
    }

    // 7. Synthesize Dynamic Greeting
    let greeting = '';

    if (proactiveFactGreeting) {
      // Proactive fact check-in takes prime focus for this single session
      greeting = proactiveFactGreeting;
    } else if (isFriday) {
      // ── FRIDAY (Warmer, conversational, energetic) ──
      if (recentTopic && todayEvent) {
        greeting = `Hey ${firstName}! Good ${timeGreetingFriday}. Last we spoke you were looking at "${recentTopic}" — and heads up, you've got ${todayEvent.summary} at ${todayEvent.timeStr} on your calendar.`;
      } else if (recentTopic) {
        greeting = `Hey ${firstName}! Good ${timeGreetingFriday}. Picking right back up where we left off with "${recentTopic}" — all tactical systems are online.`;
      } else if (todayEvent) {
        greeting = `Hey ${firstName}! Good ${timeGreetingFriday}. All systems are ready to rock — and I see you have ${todayEvent.summary} at ${todayEvent.timeStr} today.`;
      } else {
        greeting = `Hey there, ${firstName}. All tactical systems are online and listening. What are we working on today?`;
      }
    } else {
      // ── JARVIS (Refined, crisp, respectful) ──
      if (recentTopic && todayEvent) {
        greeting = `Good ${timeGreetingJarvis}, ${firstName}. Last we spoke you were working on "${recentTopic}" — and I see you have ${todayEvent.summary} scheduled for ${todayEvent.timeStr} today.`;
      } else if (recentTopic) {
        greeting = `Good ${timeGreetingJarvis}, ${firstName}. Last we spoke you were working on "${recentTopic}". All neural systems are online and ready to continue.`;
      } else if (todayEvent) {
        greeting = `Good ${timeGreetingJarvis}, ${firstName}. All core systems are nominal — I note you have ${todayEvent.summary} on your calendar for ${todayEvent.timeStr} today.`;
      } else {
        greeting = `Good ${timeGreetingJarvis}, ${firstName}. All systems are online and listening. How may I assist you today?`;
      }
    }

    return NextResponse.json({
      greeting,
      time_of_day: isFriday ? timeGreetingFriday : timeGreetingJarvis,
      recent_topic: recentTopic,
      calendar_event: todayEvent,
      proactive_fact: Boolean(proactiveFactGreeting),
      persona: personaParam,
    });
  } catch (error: any) {
    console.error('[Greeting API] Error:', error);
    return NextResponse.json({
      greeting: 'All systems are online and listening. How may I assist you today?',
      fallback: true,
    });
  }
}
