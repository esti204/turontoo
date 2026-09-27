// backend/server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 5000;

// ---------- MIDDLEWARE ----------
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ---------- SUPABASE CLIENT ----------
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ---------- HEALTH CHECK ----------
app.get('/', (req, res) => {
  res.json({ ok: true, service: 'Turontoo API', version: '2.2.0', time: new Date().toISOString() });
});

// =====================================================
// AUTH
// =====================================================

app.post('/api/auth/signup', async (req, res) => {
  try {
    const { email, password, full_name, full_name_bn, phone, city, area } = req.body;
    if (!email || !password) return res.status(400).json({ ok: false, error: 'Email and password are required' });
    if (password.length < 6) return res.status(400).json({ ok: false, error: 'Password must be at least 6 characters' });

    const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
      email, password, email_confirm: true,
      user_metadata: { full_name, full_name_bn }
    });
    if (authErr) throw authErr;
    const authUserId = authData.user.id;

    const { data: profile, error: profileErr } = await supabase
      .from('users')
      .insert([{
        id: authUserId,
        phone: phone || null,
        full_name: full_name || null,
        full_name_bn: full_name_bn || null,
        city: city || null,
        area: area || null
      }])
      .select()
      .single();
    if (profileErr) throw profileErr;

    res.status(201).json({ ok: true, user: profile, auth_id: authUserId });
  } catch (err) {
    console.error('POST /api/auth/signup:', err);
    res.status(400).json({ ok: false, error: err.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ ok: false, error: 'Email and password are required' });

    const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
    if (signInErr) return res.status(401).json({ ok: false, error: 'Invalid email or password' });
    const authUserId = signInData.user.id;

    let { data: profile } = await supabase.from('users').select('*').eq('id', authUserId).maybeSingle();

    if (!profile) {
      const meta = signInData.user.user_metadata || {};
      const { data: newProfile, error: createErr } = await supabase
        .from('users')
        .insert([{ id: authUserId, full_name: meta.full_name || null, full_name_bn: meta.full_name_bn || null }])
        .select()
        .single();
      if (createErr) throw createErr;
      profile = newProfile;
    }

    res.json({ ok: true, user: profile, auth_id: authUserId, session: signInData.session });
  } catch (err) {
    console.error('POST /api/auth/login:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// =====================================================
// USERS
// =====================================================

app.get('/api/users/:id', async (req, res) => {
  try {
    const { data, error } = await supabase.from('users').select('*').eq('id', req.params.id).single();
    if (error) throw error;
    res.json({ ok: true, user: data });
  } catch (err) {
    res.status(404).json({ ok: false, error: 'User not found' });
  }
});

app.patch('/api/users/:id', async (req, res) => {
  try {
    const allowed = ['full_name', 'full_name_bn', 'bio', 'bio_bn', 'phone', 'city', 'area', 'avatar_url', 'theme', 'skills', 'experience', 'nid_verified', 'verification_status'];
    const updates = {};
    for (const k of allowed) {
      if (req.body[k] !== undefined) updates[k] = req.body[k];
    }
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ ok: false, error: 'No valid fields to update' });
    }
    updates.updated_at = new Date().toISOString();

    const { error: updateErr } = await supabase
      .from('users')
      .update(updates)
      .eq('id', req.params.id);
    if (updateErr) throw updateErr;

    const { data, error: fetchErr } = await supabase
      .from('users')
      .select('*')
      .eq('id', req.params.id)
      .maybeSingle();
    if (fetchErr) throw fetchErr;
    if (!data) return res.status(404).json({ ok: false, error: 'User not found' });

    res.json({ ok: true, user: data });
  } catch (err) {
    console.error('PATCH /api/users/:id:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/users/:id/stats', async (req, res) => {
  try {
    const uid = req.params.id;

    const [postedRes, appliedRes, completedRes, reviewsRes] = await Promise.all([
      supabase.from('gigs').select('id', { count: 'exact', head: true }).eq('poster_id', uid),
      supabase.from('applications').select('id', { count: 'exact', head: true }).eq('worker_id', uid),
      supabase.from('applications').select('id', { count: 'exact', head: true }).eq('worker_id', uid).eq('status', 'completed'),
      supabase.from('reviews').select('rating').eq('reviewee_id', uid)
    ]);

    const reviews = reviewsRes.data || [];
    const avgRating = reviews.length
      ? (reviews.reduce((s, r) => s + (r.rating || 0), 0) / reviews.length).toFixed(1)
      : '0.0';

    res.json({
      ok: true,
      stats: {
        total_posted: postedRes.count || 0,
        total_applied: appliedRes.count || 0,
        total_completed: completedRes.count || 0,
        total_reviews: reviews.length,
        avg_rating: Number(avgRating)
      }
    });
  } catch (err) {
    console.error('GET /api/users/:id/stats:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/users/:id/reviews', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('reviews')
      .select(`
        *,
        reviewer:users!reviews_reviewer_id_fkey (id, full_name, full_name_bn)
      `)
      .eq('reviewee_id', req.params.id)
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ ok: true, reviews: data || [] });
  } catch (err) {
    console.error('GET /api/users/:id/reviews:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/users/:id/reviews', async (req, res) => {
  try {
    const { reviewer_id, gig_id, rating, comment, role } = req.body;
    if (!reviewer_id || !rating) return res.status(400).json({ ok: false, error: 'reviewer_id and rating required' });
    if (rating < 1 || rating > 5) return res.status(400).json({ ok: false, error: 'Rating must be 1-5' });

    let dupQuery = supabase
      .from('reviews')
      .select('id')
      .eq('reviewer_id', reviewer_id)
      .eq('reviewee_id', req.params.id);
    if (gig_id) dupQuery = dupQuery.eq('gig_id', gig_id);
    const { data: existing } = await dupQuery.maybeSingle();
    if (existing) {
      return res.status(409).json({ ok: false, error: 'You have already reviewed this user for this job' });
    }

    const { data, error } = await supabase
      .from('reviews')
      .insert([{ gig_id: gig_id || null, reviewer_id, reviewee_id: req.params.id, rating, comment, role }])
      .select()
      .single();
    if (error) throw error;

    try {
      const { error: notifErr } = await supabase.from('notifications').insert([{
        user_id: req.params.id,
        type: 'review',
        title: 'New review received',
        body: `You received a ${rating}-star review.`,
        link: `profile.html`
      }]);
      if (notifErr) console.error('notif insert (review) failed:', notifErr);
    } catch (e) { console.error('notif exception (review):', e); }

    res.status(201).json({ ok: true, review: data });
  } catch (err) {
    console.error('POST /api/users/:id/reviews:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/users/:id/gigs', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('gigs')
      .select('*')
      .eq('poster_id', req.params.id)
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ ok: true, gigs: data || [] });
  } catch (err) {
    console.error('GET /api/users/:id/gigs:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/users/:id/applications', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('applications')
      .select(`
        *,
        gig:gigs (
          id, title, title_bn, wage, city, area, is_urgent, status, created_at,
          poster:users!gigs_poster_id_fkey (id, full_name, full_name_bn)
        )
      `)
      .eq('worker_id', req.params.id)
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ ok: true, applications: data || [] });
  } catch (err) {
    console.error('GET /api/users/:id/applications:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// =====================================================
// GIGS
// =====================================================

app.get('/api/gigs', async (req, res) => {
  try {
    const { city, category, urgent, limit = 50 } = req.query;

    let query = supabase
      .from('gigs')
      .select(`
        *,
        poster:users!gigs_poster_id_fkey (
          id, full_name, full_name_bn, avatar_url, nid_verified, rating_as_worker, rating_as_poster
        )
      `)
      .eq('status', 'open')
      .order('created_at', { ascending: false })
      .limit(Number(limit));

    if (city) query = query.eq('city', city);
    if (category) query = query.eq('category', category);
    if (urgent === 'true') query = query.eq('is_urgent', true);

    const { data, error } = await query;
    if (error) throw error;
    res.json({ ok: true, count: data.length, gigs: data });
  } catch (err) {
    console.error('GET /api/gigs:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/gigs/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('gigs')
      .select(`
        *,
        poster:users!gigs_poster_id_fkey (
          id, full_name, full_name_bn, avatar_url, nid_verified, rating_as_worker, rating_as_poster, total_jobs_posted, created_at
        )
      `)
      .eq('id', req.params.id)
      .single();
    if (error) throw error;
    if (!data) return res.status(404).json({ ok: false, error: 'Gig not found' });
    res.json({ ok: true, gig: data });
  } catch (err) {
    res.status(404).json({ ok: false, error: 'Gig not found' });
  }
});

app.post('/api/gigs', async (req, res) => {
  try {
    const {
      poster_id, poster_phone, poster_name, poster_name_bn,
      title, title_bn, description, description_bn,
      category, city, area, address, wage, workers_needed,
      payment_method, is_urgent, start_time, end_time
    } = req.body;

    if (!title || !wage) return res.status(400).json({ ok: false, error: 'title and wage are required' });

    let finalPosterId = poster_id;

    if (!finalPosterId) {
      if (!poster_phone) return res.status(400).json({ ok: false, error: 'poster_id or poster_phone is required' });

      const { data: existingUser } = await supabase.from('users').select('id').eq('phone', poster_phone).maybeSingle();
      if (existingUser) {
        finalPosterId = existingUser.id;
      } else {
        const { data: newUser, error: createErr } = await supabase
          .from('users')
          .insert([{ phone: poster_phone, full_name: poster_name || 'Turontoo User', full_name_bn: poster_name_bn || null, city: city || null, area: area || null }])
          .select('id').single();
        if (createErr) throw createErr;
        finalPosterId = newUser.id;
      }
    }

    const { data, error } = await supabase
      .from('gigs')
      .insert([{
        poster_id: finalPosterId, title, title_bn, description, description_bn,
        category, city, area, address, wage,
        workers_needed: workers_needed || 1,
        payment_method: payment_method || 'cash',
        is_urgent: !!is_urgent,
        start_time: start_time || null,
        end_time: end_time || null
      }])
      .select()
      .single();
    if (error) throw error;

    try {
      const { data: userRow } = await supabase.from('users').select('total_jobs_posted').eq('id', finalPosterId).single();
      await supabase.from('users').update({ total_jobs_posted: (userRow?.total_jobs_posted || 0) + 1 }).eq('id', finalPosterId);
    } catch (e) { console.error('total_jobs_posted inc failed:', e); }

    res.status(201).json({ ok: true, gig: data, poster_id: finalPosterId });
  } catch (err) {
    console.error('POST /api/gigs:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ---------- POST /api/gigs/:id/apply ----------
app.post('/api/gigs/:id/apply', async (req, res) => {
  try {
    const { worker_id, proposed_rate } = req.body;
    if (!worker_id) return res.status(400).json({ ok: false, error: 'worker_id is required' });

    const { data: gigCheck } = await supabase.from('gigs').select('poster_id, title, status').eq('id', req.params.id).single();
    if (gigCheck && gigCheck.poster_id === worker_id) {
      return res.status(400).json({ ok: false, error: 'You cannot apply to your own job' });
    }
    if (gigCheck && gigCheck.status !== 'open') {
      return res.status(400).json({ ok: false, error: 'This job is no longer accepting applications' });
    }

    const { data, error } = await supabase
      .from('applications')
      .insert([{ gig_id: req.params.id, worker_id, proposed_rate, status: 'applied' }])
      .select().single();
    if (error) {
      if (String(error.message || '').includes('duplicate')) {
        return res.status(409).json({ ok: false, error: 'You already applied to this job' });
      }
      throw error;
    }

    // Notify the poster → link to their own profile (where Manage Applicants lives)
    if (gigCheck && gigCheck.poster_id) {
      try {
        const { error: notifErr } = await supabase.from('notifications').insert([{
          user_id: gigCheck.poster_id,
          type: 'application',
          title: 'New application',
          body: `Someone applied to: ${gigCheck.title}`,
          link: `profile.html`
        }]);
        if (notifErr) console.error('notif insert (apply) failed:', notifErr);
        else console.log('✅ notif sent to poster', gigCheck.poster_id);
      } catch (e) { console.error('notif exception (apply):', e); }
    }

    res.status(201).json({ ok: true, application: data });
  } catch (err) {
    console.error('POST apply:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ---------- PATCH /api/applications/:id/status ----------
// THE KEY FIX: notification link depends on status.
//   booked  → worker → chat with poster about this gig
//   completed → worker → their activity page to review
app.patch('/api/applications/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const allowed = ['applied', 'booked', 'completed', 'cancelled'];
    if (!status || !allowed.includes(status)) {
      return res.status(400).json({ ok: false, error: 'Valid status required' });
    }

    const { data: current, error: loadErr } = await supabase
      .from('applications')
      .select('id, gig_id, worker_id, status')
      .eq('id', req.params.id)
      .maybeSingle();
    if (loadErr) throw loadErr;
    if (!current) return res.status(404).json({ ok: false, error: 'Application not found' });

    const oldStatus = current.status;

    const { error: updateErr } = await supabase
      .from('applications')
      .update({ status })
      .eq('id', req.params.id);
    if (updateErr) throw updateErr;

    // Auto-close gig when full
    if (status === 'completed' && oldStatus !== 'completed') {
      const { data: gig, error: gigErr } = await supabase
        .from('gigs')
        .select('id, workers_needed, workers_hired, status')
        .eq('id', current.gig_id)
        .maybeSingle();
      if (gigErr) console.error('gig lookup:', gigErr);

      if (gig) {
        const newHired = (gig.workers_hired || 0) + 1;
        const needed = gig.workers_needed || 1;
        const newStatus = newHired >= needed ? 'filled' : (gig.status || 'open');
        const { error: u2 } = await supabase
          .from('gigs')
          .update({ workers_hired: newHired, status: newStatus })
          .eq('id', gig.id);
        if (u2) console.error('gig update (complete):', u2);
        else console.log(`✅ gig ${gig.id} → hired ${newHired}/${needed}, status=${newStatus}`);
      }
    }

    const { data, error: fetchErr } = await supabase
      .from('applications')
      .select(`
        *,
        gig:gigs (id, title, title_bn, wage, poster_id, status),
        worker:users!applications_worker_id_fkey (id, full_name, full_name_bn)
      `)
      .eq('id', req.params.id)
      .maybeSingle();
    if (fetchErr) throw fetchErr;

    // Notify worker with correct destination
    if (data && data.worker && data.worker.id && (status === 'booked' || status === 'completed')) {
      try {
        const gigTitle = data.gig ? (data.gig.title_bn || data.gig.title) : 'a job';
        const posterId = data.gig ? data.gig.poster_id : '';
        const gigId = data.gig ? data.gig.id : '';

        // 👇 THE FIX: correct link per status
        const notifLink = status === 'booked'
          ? `chat.html?gig=${gigId}&with=${posterId}`
          : `profile.html`;

        const { error: notifErr } = await supabase.from('notifications').insert([{
          user_id: data.worker.id,
          type: 'application_' + status,
          title: status === 'booked' ? 'You were hired!' : 'Job marked completed',
          body: status === 'booked'
            ? `You've been booked for "${gigTitle}". Chat the poster to coordinate.`
            : `"${gigTitle}" has been marked completed. Leave a review!`,
          link: notifLink
        }]);
        if (notifErr) console.error('notif insert (status) failed:', notifErr);
        else console.log('✅ notif sent to worker', data.worker.id, '→', notifLink);
      } catch (e) { console.error('notif exception (status):', e); }
    }

    res.json({ ok: true, application: data });
  } catch (err) {
    console.error('PATCH /api/applications/:id/status:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/gigs/:id/applications', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('applications')
      .select(`
        *,
        worker:users!applications_worker_id_fkey (id, full_name, full_name_bn, avatar_url, rating_as_worker)
      `)
      .eq('gig_id', req.params.id)
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ ok: true, applications: data || [] });
  } catch (err) {
    console.error('GET /api/gigs/:id/applications:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// =====================================================
// MESSAGES
// =====================================================

app.get('/api/messages/:gigId/:userA/:userB', async (req, res) => {
  try {
    const { gigId, userA, userB } = req.params;
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('gig_id', gigId)
      .or(`and(sender_id.eq.${userA},receiver_id.eq.${userB}),and(sender_id.eq.${userB},receiver_id.eq.${userA})`)
      .order('created_at', { ascending: true });
    if (error) throw error;
    res.json({ ok: true, messages: data || [] });
  } catch (err) {
    console.error('GET /api/messages:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/messages', async (req, res) => {
  try {
    const { gig_id, sender_id, receiver_id, content, message_type, attachment_url } = req.body;
    if (!gig_id || !sender_id || !receiver_id) {
      return res.status(400).json({ ok: false, error: 'gig_id, sender_id, receiver_id required' });
    }

    const { data, error } = await supabase
      .from('messages')
      .insert([{
        gig_id, sender_id, receiver_id,
        content: content || null,
        message_type: message_type || 'text',
        attachment_url: attachment_url || null
      }])
      .select().single();
    if (error) throw error;

    try {
      const { error: notifErr } = await supabase.from('notifications').insert([{
        user_id: receiver_id,
        type: 'message',
        title: 'New message',
        body: (content || 'Sent you a message').slice(0, 80),
        link: `chat.html?gig=${gig_id}&with=${sender_id}`
      }]);
      if (notifErr) console.error('notif insert (message) failed:', notifErr);
    } catch (e) { console.error('notif exception (message):', e); }

    res.status(201).json({ ok: true, message: data });
  } catch (err) {
    console.error('POST /api/messages:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// =====================================================
// NOTIFICATIONS
// =====================================================

app.get('/api/notifications/:userId', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', req.params.userId)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw error;
    const unread = (data || []).filter(n => !n.is_read).length;
    res.json({ ok: true, notifications: data || [], unread });
  } catch (err) {
    console.error('GET /api/notifications:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.patch('/api/notifications/:id/read', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', req.params.id)
      .select().single();
    if (error) throw error;
    res.json({ ok: true, notification: data });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.patch('/api/notifications/read-all/:userId', async (req, res) => {
  try {
    const { error } = await supabase.from('notifications').update({ is_read: true }).eq('user_id', req.params.userId).eq('is_read', false);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// =====================================================
// REPORTS
// =====================================================

app.post('/api/reports', async (req, res) => {
  try {
    const { reporter_id, report_type, reference_id, reason, description, proof_url } = req.body;
    if (!report_type || !reason) return res.status(400).json({ ok: false, error: 'report_type and reason required' });

    const { data, error } = await supabase
      .from('reports')
      .insert([{ reporter_id: reporter_id || null, report_type, reference_id, reason, description, proof_url }])
      .select().single();
    if (error) throw error;
    res.status(201).json({ ok: true, report: data });
  } catch (err) {
    console.error('POST /api/reports:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// =====================================================
// 404 + START
// =====================================================
app.use((req, res) => {
  res.status(404).json({ ok: false, error: 'Route not found' });
});

app.listen(PORT, () => {
  console.log('🚀 Turontoo API running at http://localhost:' + PORT);
  console.log('📡 Supabase:', process.env.SUPABASE_URL);
});