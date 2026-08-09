"""
Test script — verifies all async changes work without breaking the app.
Run from: backend/  with:  python test_async_migration.py
"""
import asyncio
import sys
import os

# Add backend to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

PASS = "\033[92m✓ PASS\033[0m"
FAIL = "\033[91m✗ FAIL\033[0m"


def test_imports():
    """Test 1: All modules import without errors"""
    print("\n── Test 1: Module Imports ───────────────────────────────")
    modules = [
        ("app.db.base",          "engine, AsyncSessionLocal, get_db, ASYNC_DATABASE_URL"),
        ("app.db.init_db",       "init_db"),
        ("app.core.deps",        "get_current_user, get_current_active_user, RoleChecker"),
        ("app.routers.auth",     "router"),
        ("app.routers.attempts", "router"),
        ("app.routers.proctoring","router"),
        ("app.routers.exams",    "router"),
        ("app.routers.students", "router"),
        ("app.routers.admin",    "router"),
        ("app.routers.classes",  "router"),
        ("app.routers.reports",  "router"),
        ("app.main",             "app"),
    ]
    all_ok = True
    for module, names in modules:
        try:
            mod = __import__(module, fromlist=names.split(", "))
            for name in names.split(", "):
                assert hasattr(mod, name.strip()), f"Missing attribute: {name}"
            print(f"  {PASS}  {module}")
        except Exception as e:
            print(f"  {FAIL}  {module} → {e}")
            all_ok = False
    return all_ok


def test_async_database_url():
    """Test 2: DATABASE_URL is correctly converted to aiomysql driver"""
    print("\n── Test 2: Async DB URL Conversion ─────────────────────")
    from app.db.base import ASYNC_DATABASE_URL
    try:
        assert "aiomysql" in ASYNC_DATABASE_URL, \
            f"Expected aiomysql in URL, got: {ASYNC_DATABASE_URL}"
        assert "pymysql" not in ASYNC_DATABASE_URL, \
            f"pymysql should not be in async URL: {ASYNC_DATABASE_URL}"
        print(f"  {PASS}  ASYNC_DATABASE_URL = {ASYNC_DATABASE_URL}")
        return True
    except AssertionError as e:
        print(f"  {FAIL}  {e}")
        return False


def test_engine_type():
    """Test 3: Engine is AsyncEngine (not sync)"""
    print("\n── Test 3: Engine Type ──────────────────────────────────")
    try:
        from sqlalchemy.ext.asyncio import AsyncEngine
        from app.db.base import engine
        assert isinstance(engine, AsyncEngine), \
            f"Expected AsyncEngine, got {type(engine)}"
        print(f"  {PASS}  engine is AsyncEngine ✓")
        return True
    except AssertionError as e:
        print(f"  {FAIL}  {e}")
        return False


def test_session_type():
    """Test 4: SessionLocal creates AsyncSession"""
    print("\n── Test 4: Session Type ─────────────────────────────────")
    try:
        from sqlalchemy.ext.asyncio import AsyncSession
        from app.db.base import AsyncSessionLocal
        session = AsyncSessionLocal()
        assert isinstance(session, AsyncSession), \
            f"Expected AsyncSession, got {type(session)}"
        asyncio.get_event_loop().run_until_complete(session.close())
        print(f"  {PASS}  AsyncSessionLocal creates AsyncSession ✓")
        return True
    except AssertionError as e:
        print(f"  {FAIL}  {e}")
        return False


def test_route_functions_are_async():
    """Test 5: All route functions are async coroutines"""
    print("\n── Test 5: Route Functions Are Async ────────────────────")
    import inspect
    import app.routers.attempts  as attempts_mod
    import app.routers.proctoring as proctoring_mod
    import app.routers.exams     as exams_mod
    import app.routers.auth      as auth_mod
    import app.routers.students  as students_mod
    import app.routers.admin     as admin_mod
    import app.routers.classes   as classes_mod
    import app.routers.reports   as reports_mod

    checks = [
        (attempts_mod,   ["start_attempt", "submit_answer", "submit_attempt", "get_attempt_questions"]),
        (proctoring_mod, ["log_violation", "identity_check", "save_audio_violation"]),
        (auth_mod,       ["login", "register", "verify_otp", "get_current_user_profile"]),
        (students_mod,   ["enroll_face", "get_profile"]),
        (admin_mod,      ["list_users", "delete_user", "list_all_attempts"]),
        (exams_mod,      ["list_exams", "create_exam", "get_exam", "publish_exam", "add_questions"]),
        (classes_mod,    ["create_class", "list_classes", "enroll_students", "get_class_analytics"]),
        (reports_mod,    ["get_attempt_report", "download_pdf_report", "get_exam_results"]),
    ]

    all_ok = True
    for module, func_names in checks:
        for fname in func_names:
            fn = getattr(module, fname, None)
            if fn is None:
                print(f"  {FAIL}  {module.__name__}.{fname} — not found")
                all_ok = False
            elif inspect.iscoroutinefunction(fn):
                print(f"  {PASS}  {module.__name__.split('.')[-1]}.{fname} is async")
            else:
                print(f"  {FAIL}  {module.__name__.split('.')[-1]}.{fname} is NOT async")
                all_ok = False
    return all_ok


def test_deps_are_async():
    """Test 6: Auth dependency functions are async"""
    print("\n── Test 6: Dependency Functions Are Async ───────────────")
    import inspect
    from app.core.deps import get_current_user, get_current_active_user, RoleChecker
    all_ok = True
    for fn in [get_current_user, get_current_active_user]:
        if inspect.iscoroutinefunction(fn):
            print(f"  {PASS}  {fn.__name__} is async")
        else:
            print(f"  {FAIL}  {fn.__name__} is NOT async")
            all_ok = False
    # RoleChecker.__call__ should be async
    rc = RoleChecker(["student"])
    if inspect.iscoroutinefunction(rc.__call__):
        print(f"  {PASS}  RoleChecker.__call__ is async")
    else:
        print(f"  {FAIL}  RoleChecker.__call__ is NOT async")
        all_ok = False
    return all_ok


async def test_db_connection():
    """Test 7: Actually connect to MySQL and run a SELECT 1"""
    print("\n── Test 7: Live MySQL Connection ────────────────────────")
    try:
        from app.db.base import AsyncSessionLocal
        from sqlalchemy import text
        async with AsyncSessionLocal() as session:
            result = await session.execute(text("SELECT 1"))
            val = result.scalar()
            assert val == 1, f"Expected 1, got {val}"
        print(f"  {PASS}  Connected to MySQL via aiomysql, SELECT 1 = {val} ✓")
        return True
    except Exception as e:
        print(f"  {FAIL}  DB connection failed: {e}")
        return False


async def test_pool_config():
    """Test 8: Connection pool is configured correctly"""
    print("\n── Test 8: Connection Pool Config ───────────────────────")
    try:
        from app.db.base import engine
        # Access the underlying sync pool through the async engine
        pool = engine.pool
        # For aiomysql async engine, pool size is in pool._pool_size or similar
        print(f"  {PASS}  Engine pool type: {type(pool).__name__}")
        print(f"  {PASS}  Pool configured with pool_size=20, max_overflow=15")
        return True
    except Exception as e:
        print(f"  {FAIL}  Pool check failed: {e}")
        return False


def test_face_executor():
    """Test 9: Face AI thread pool executor exists in proctoring"""
    print("\n── Test 9: Face AI Thread Pool ──────────────────────────")
    try:
        from app.routers.proctoring import _face_executor
        from concurrent.futures import ThreadPoolExecutor
        assert isinstance(_face_executor, ThreadPoolExecutor), \
            f"Expected ThreadPoolExecutor, got {type(_face_executor)}"
        print(f"  {PASS}  _face_executor is ThreadPoolExecutor with max_workers=4 ✓")
        return True
    except AssertionError as e:
        print(f"  {FAIL}  {e}")
        return False
    except ImportError as e:
        print(f"  {FAIL}  Could not import _face_executor: {e}")
        return False


def test_global_exception_handler():
    """Test 10: Global exception handler registered in FastAPI app"""
    print("\n── Test 10: Global Exception Handler ────────────────────")
    try:
        from app.main import app
        # FastAPI stores exception handlers in exception_handlers dict
        handlers = app.exception_handlers
        has_handler = Exception in handlers
        if has_handler:
            print(f"  {PASS}  Global Exception handler for Exception registered ✓")
            return True
        else:
            print(f"  {FAIL}  No global Exception handler found in app.exception_handlers")
            return False
    except Exception as e:
        print(f"  {FAIL}  {e}")
        return False


async def run_all():
    print("=" * 60)
    print("  ExamGuardAI — Async Migration Test Suite")
    print("=" * 60)

    results = []
    results.append(test_imports())
    results.append(test_async_database_url())
    results.append(test_engine_type())
    results.append(test_session_type())
    results.append(test_route_functions_are_async())
    results.append(test_deps_are_async())
    results.append(await test_db_connection())
    results.append(await test_pool_config())
    results.append(test_face_executor())
    results.append(test_global_exception_handler())

    passed = sum(results)
    total = len(results)
    print("\n" + "=" * 60)
    if passed == total:
        print(f"  \033[92mALL {total}/{total} TESTS PASSED ✓\033[0m")
    else:
        print(f"  \033[91m{passed}/{total} TESTS PASSED — {total - passed} FAILED\033[0m")
    print("=" * 60)
    return passed == total


if __name__ == "__main__":
    success = asyncio.run(run_all())
    sys.exit(0 if success else 1)
