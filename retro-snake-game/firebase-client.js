// Loads Firebase from /api/firebase-config when configured, or falls back to
// a localStorage-backed in-browser mock so the Snake arcade boots cleanly without
// hardcoded production Firebase credentials.
(function (global) {
  const MOCK_DB_KEY = 'snake_arcade_mock_db_v1';
  const MOCK_USER_KEY = 'snake_arcade_mock_user_v1';

  function loadMockDb() {
    try {
      const raw = localStorage.getItem(MOCK_DB_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {
      // ignore storage errors
    }
    return {
      users: {},
      scores: {}
    };
  }

  function saveMockDb(db) {
    try {
      localStorage.setItem(MOCK_DB_KEY, JSON.stringify(db));
    } catch (e) {
      // ignore storage errors
    }
  }

  function getByPath(obj, path) {
    if (!path) return obj;
    const parts = path.split('/').filter(Boolean);
    let cur = obj;
    for (const part of parts) {
      if (cur == null || typeof cur !== 'object') return null;
      cur = cur[part];
    }
    return cur === undefined ? null : cur;
  }

  function setByPath(obj, path, value) {
    const parts = path.split('/').filter(Boolean);
    if (parts.length === 0) return;
    let cur = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      const key = parts[i];
      if (!cur[key] || typeof cur[key] !== 'object') cur[key] = {};
      cur = cur[key];
    }
    const last = parts[parts.length - 1];
    if (value === null) {
      delete cur[last];
    } else {
      cur[last] = value;
    }
  }

  function createMockFirebase() {
    const authListeners = [];
    const valueListeners = [];

    function notifyValueListeners(changedPath) {
      const db = loadMockDb();
      valueListeners.forEach(({ path, cb }) => {
        if (changedPath.startsWith(path) || path.startsWith(changedPath)) {
          cb(makeSnapshot(path, getByPath(db, path)));
        }
      });
    }

    function makeSnapshot(key, val, sortField, limitLast) {
      let entries = [];
      if (val && typeof val === 'object' && !Array.isArray(val)) {
        entries = Object.entries(val);
        if (sortField) {
          entries.sort((a, b) => {
            const av = (a[1] && a[1][sortField]) || 0;
            const bv = (b[1] && b[1][sortField]) || 0;
            return av - bv;
          });
        }
        if (typeof limitLast === 'number' && entries.length > limitLast) {
          entries = entries.slice(entries.length - limitLast);
        }
      }
      return {
        key,
        val: () => val,
        forEach: (fn) => {
          entries.forEach(([k, v]) => {
            fn({ key: k, val: () => v });
          });
        }
      };
    }

    function createRef(path, sortField = null, limitLast = null) {
      return {
        orderByChild(field) {
          return createRef(path, field, limitLast);
        },
        limitToLast(n) {
          return createRef(path, sortField, n);
        },
        once(eventType, cb) {
          const db = loadMockDb();
          const snap = makeSnapshot(path, getByPath(db, path), sortField, limitLast);
          if (cb) cb(snap);
          return Promise.resolve(snap);
        },
        on(eventType, cb) {
          const db = loadMockDb();
          valueListeners.push({ path, cb });
          cb(makeSnapshot(path, getByPath(db, path), sortField, limitLast));
        },
        set(value) {
          const db = loadMockDb();
          setByPath(db, path, value);
          saveMockDb(db);
          notifyValueListeners(path);
          return Promise.resolve();
        },
        update(updates) {
          const db = loadMockDb();
          const existing = getByPath(db, path);
          const merged = Object.assign({}, existing && typeof existing === 'object' ? existing : {}, updates);
          setByPath(db, path, merged);
          saveMockDb(db);
          notifyValueListeners(path);
          return Promise.resolve();
        },
        remove() {
          const db = loadMockDb();
          setByPath(db, path, null);
          saveMockDb(db);
          notifyValueListeners(path);
          return Promise.resolve();
        }
      };
    }

    let currentUser = null;
    try {
      const savedUser = localStorage.getItem(MOCK_USER_KEY);
      if (savedUser) currentUser = JSON.parse(savedUser);
    } catch (e) {
      currentUser = null;
    }

    function MockGoogleAuthProvider() {
      this.setCustomParameters = function () {};
    }

    const auth = {
      get currentUser() {
        return currentUser;
      },
      onAuthStateChanged(cb) {
        authListeners.push(cb);
        setTimeout(() => cb(currentUser), 0);
      },
      signInWithPopup() {
        currentUser = {
          uid: 'local-arcade-player',
          displayName: 'Arcade Player'
        };
        try {
          localStorage.setItem(MOCK_USER_KEY, JSON.stringify(currentUser));
        } catch (e) {
          // ignore
        }
        authListeners.forEach((fn) => fn(currentUser));
        return Promise.resolve({ user: currentUser });
      },
      signOut() {
        currentUser = null;
        try {
          localStorage.removeItem(MOCK_USER_KEY);
        } catch (e) {
          // ignore
        }
        authListeners.forEach((fn) => fn(null));
        return Promise.resolve();
      }
    };

    const database = {
      ref(path) {
        return createRef(path);
      }
    };

    return {
      isMock: true,
      auth,
      database,
      GoogleAuthProvider: MockGoogleAuthProvider
    };
  }

  global.initSnakeFirebase = async function () {
    try {
      const res = await fetch('/api/firebase-config');
      if (res.ok) {
        const data = await res.json();
        if (data && data.configured && data.config && global.firebase) {
          if (!global.firebase.apps.length) {
            global.firebase.initializeApp(data.config);
          }
          return {
            isMock: false,
            auth: global.firebase.auth(),
            database: global.firebase.database(),
            GoogleAuthProvider: global.firebase.auth.GoogleAuthProvider
          };
        }
      }
    } catch (e) {
      // Fallback to local mock when Firebase config endpoint is unavailable
    }
    return createMockFirebase();
  };
})(window);
