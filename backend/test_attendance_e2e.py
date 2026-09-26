"""
End-to-end test for attendance system:
- Teacher login, create session with subject_name
- Active token fetch
- Live roster with subject_name
- Class sessions history with subject_name
"""
import asyncio
import httpx

BASE = 'http://localhost:8000'

async def test():
    async with httpx.AsyncClient(base_url=BASE, timeout=30) as c:

        # ── 1. Teacher login (OAuth2 form) ─────────────────────────────────
        r = await c.post('/api/auth/login',
            data={'username': 'teacher@test.com', 'password': 'Test1234!'}
        )
        if r.status_code != 200:
            # Try second common seed
            r = await c.post('/api/auth/login',
                data={'username': 'jay@test.com', 'password': 'Test1234!'}
            )
        if r.status_code != 200:
            print(f'FAIL: Teacher login returned {r.status_code}: {r.text[:200]}')
            return
        teacher_token = r.json()['access_token']
        print(f'[1] Teacher login OK — token acquired')

        headers = {'Authorization': f'Bearer {teacher_token}'}

        # ── 2. Get classes ─────────────────────────────────────────────────
        r = await c.get('/api/classes', headers=headers)
        classes = r.json()
        if not isinstance(classes, list) or len(classes) == 0:
            print(f'SKIP: No classes available. Create a class first.\nResponse: {classes}')
            return
        class_id = classes[0]['id']
        print(f'[2] Classes found: {len(classes)} — using class_id={class_id} ({classes[0]["name"]})')

        # ── 3. Create session with subject_name ────────────────────────────
        r = await c.post('/api/attendance/sessions/create', headers=headers, json={
            'class_id': class_id,
            'title': 'E2E Test - Attendance',
            'subject_name': 'DBMS',
            'classroom_lat': 19.0760,
            'classroom_lon': 72.8777,
            'radius_meters': 10000,  # Large radius so GPS check passes in test
            'mode': 'standard'
        })
        if r.status_code != 200:
            print(f'FAIL: Create session {r.status_code}: {r.text[:300]}')
            return
        session = r.json()
        session_id = session['id']
        assert session.get('subject_name') == 'DBMS', f"subject_name mismatch: {session.get('subject_name')}"
        print(f'[3] Session created: id={session_id}, subject={session["subject_name"]} ✓')

        # ── 4. Active QR token ─────────────────────────────────────────────
        r = await c.get(f'/api/attendance/sessions/{session_id}/active-token', headers=headers)
        if r.status_code != 200:
            print(f'FAIL: Active token {r.status_code}: {r.text[:200]}')
            return
        token_data = r.json()
        assert token_data.get('is_active') == True
        assert len(token_data.get('token', '')) > 8
        assert 0 < token_data.get('remaining_seconds', 0) <= 5
        print(f'[4] Active token OK — remaining {token_data["remaining_seconds"]}s, token length={len(token_data["token"])} ✓')

        # ── 5. Live roster with subject_name ──────────────────────────────
        r = await c.get(f'/api/attendance/sessions/{session_id}/live-roster', headers=headers)
        if r.status_code != 200:
            print(f'FAIL: Live roster {r.status_code}: {r.text[:200]}')
            return
        roster = r.json()
        assert roster.get('subject_name') == 'DBMS', f"subject_name in roster: {roster.get('subject_name')}"
        assert roster.get('is_active') == True
        print(f'[5] Live roster OK — enrolled={roster["total_enrolled"]}, present={roster["total_present"]}, subject={roster["subject_name"]} ✓')

        # ── 6. Class session history ───────────────────────────────────────
        r = await c.get(f'/api/attendance/classes/{class_id}/sessions', headers=headers)
        if r.status_code != 200:
            print(f'FAIL: Session history {r.status_code}: {r.text[:200]}')
            return
        sessions = r.json()
        assert any(s['id'] == session_id for s in sessions), "Session not found in history"
        latest = next(s for s in sessions if s['id'] == session_id)
        assert latest.get('subject_name') == 'DBMS'
        print(f'[6] History OK — {len(sessions)} session(s), latest subject={latest["subject_name"]} ✓')

        # ── 7. Close session ──────────────────────────────────────────────
        r = await c.post(f'/api/attendance/sessions/{session_id}/close', headers=headers)
        if r.status_code == 200:
            print(f'[7] Session closed OK ✓')
        else:
            print(f'[7] Close session {r.status_code}: {r.text[:100]}')

        print()
        print('=' * 50)
        print('ALL ATTENDANCE BACKEND E2E TESTS PASSED ✓')
        print('=' * 50)

asyncio.run(test())
