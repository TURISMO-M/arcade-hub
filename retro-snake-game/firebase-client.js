// Real Firebase Auth (Google Sign-In) + Cloud Firestore client for Retro Snake Game
(function (global) {
  const OperationType = {
    CREATE: 'create',
    UPDATE: 'update',
    DELETE: 'delete',
    LIST: 'list',
    GET: 'get',
    WRITE: 'write'
  };

  // Blueprint-aligned payload sanitization constants (synced with firebase-blueprint.json & firestore.rules)
  const MAX_DISPLAY_NAME_LEN = 50;
  const MAX_USERNAME_LEN = 30;
  const USERNAME_PATTERN = /^[a-zA-Z0-9_.\-]+$/;
  const MAX_SCORE = 1000000;

  function sanitizeDisplayName(raw, fallback) {
    const cleaned = String(raw || '').trim().slice(0, MAX_DISPLAY_NAME_LEN);
    return cleaned || String(fallback || 'Player').trim().slice(0, MAX_DISPLAY_NAME_LEN) || 'Player';
  }

  function sanitizeUsername(raw) {
    const stripped = String(raw || '').trim().replace(/^@+/, '').slice(0, MAX_USERNAME_LEN);
    if (!stripped || !USERNAME_PATTERN.test(stripped)) {
      return null;
    }
    return stripped;
  }

  function sanitizeScore(raw) {
    const num = Math.floor(Number(raw) || 0);
    if (num < 0) return 0;
    if (num > MAX_SCORE) return MAX_SCORE;
    return num;
  }

  async function loadFirebaseConfig() {
    try {
      const res = await fetch('/firebase-applet-config.json', { cache: 'no-store' });
      if (res.ok) {
        const cfg = await res.json();
        if (cfg && cfg.apiKey && cfg.projectId && cfg.projectId !== 'remixed-project-id') {
          return cfg;
        }
      }
    } catch (e) {
      // Fallback to /api/firebase-config
    }

    try {
      const res = await fetch('/api/firebase-config', { cache: 'no-store' });
      if (res.ok) {
        const payload = await res.json();
        if (payload && payload.configured && payload.config) {
          return payload.config;
        }
      }
    } catch (e) {
      // No config available
    }

    return null;
  }

  let initPromise = null;

  global.initSnakeFirebase = function () {
    if (initPromise) return initPromise;

    initPromise = (async () => {
      const config = await loadFirebaseConfig();
      if (!config) {
        throw new Error('Firebase configuration not found. Please configure firebase-applet-config.json.');
      }

      const [appMod, authMod, fsMod] = await Promise.all([
        import('https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js'),
        import('https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js'),
        import('https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js')
      ]);

      const { initializeApp, getApps, getApp } = appMod;
      const {
        getAuth,
        GoogleAuthProvider,
        signInWithPopup,
        signOut,
        onAuthStateChanged
      } = authMod;
      const {
        getFirestore,
        doc,
        collection,
        getDoc,
        getDocFromServer,
        getDocs,
        setDoc,
        updateDoc,
        deleteDoc,
        onSnapshot,
        query,
        where,
        orderBy,
        limit,
        serverTimestamp
      } = fsMod;

      const app = getApps().length ? getApp() : initializeApp(config);
      const db = config.firestoreDatabaseId
        ? getFirestore(app, config.firestoreDatabaseId)
        : getFirestore(app);
      const auth = getAuth(app);

      function handleFirestoreError(error, operationType, path) {
        const user = auth.currentUser;
        const errInfo = {
          error: error instanceof Error ? error.message : String(error),
          authInfo: {
            userId: user ? user.uid : null,
            email: user ? user.email : null,
            emailVerified: user ? user.emailVerified : null,
            isAnonymous: user ? user.isAnonymous : null,
            tenantId: user ? user.tenantId : null,
            providerInfo: user && Array.isArray(user.providerData)
              ? user.providerData.map(function (provider) {
                  return {
                    providerId: provider.providerId,
                    email: provider.email
                  };
                })
              : []
          },
          operationType: operationType,
          path: path
        };
        console.error('Firestore Error: ', JSON.stringify(errInfo));
        throw new Error(JSON.stringify(errInfo));
      }

      async function testConnection() {
        try {
          await getDocFromServer(doc(db, 'test', 'connection'));
        } catch (error) {
          if (error instanceof Error && error.message.includes('the client is offline')) {
            console.error('Please check your Firebase configuration.');
          }
        }
      }
      testConnection();

      async function signInWithGoogle() {
        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });
        return signInWithPopup(auth, provider);
      }

      async function signOutUser() {
        return signOut(auth);
      }

      function onAuthChange(cb) {
        return onAuthStateChanged(auth, cb);
      }

      async function getUserProfile(uid) {
        const path = 'users/' + uid;
        try {
          const snap = await getDoc(doc(db, 'users', uid));
          return snap.exists() ? snap.data() : null;
        } catch (error) {
          handleFirestoreError(error, OperationType.GET, path);
        }
      }

      async function createUserProfile(uid, rawDisplayName, rawUsername) {
        const displayName = sanitizeDisplayName(rawDisplayName, 'Player');
        const username = sanitizeUsername(rawUsername);
        if (!username) {
          throw new Error('Username may only contain letters, numbers, dots, underscores, or hyphens.');
        }

        const path = 'users/' + uid;
        try {
          await setDoc(doc(db, 'users', uid), {
            uid: uid,
            displayName: displayName,
            username: username,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });
          return { displayName: displayName, username: username };
        } catch (error) {
          handleFirestoreError(error, OperationType.CREATE, path);
        }
      }

      async function updateUserProfile(uid, rawDisplayName, rawUsername) {
        const displayName = sanitizeDisplayName(rawDisplayName, 'Player');
        const username = sanitizeUsername(rawUsername);
        if (!username) {
          throw new Error('Username may only contain letters, numbers, dots, underscores, or hyphens.');
        }

        const userPath = 'users/' + uid;
        try {
          const existingSnap = await getDoc(doc(db, 'users', uid));
          if (!existingSnap.exists()) {
            await setDoc(doc(db, 'users', uid), {
              uid: uid,
              displayName: displayName,
              username: username,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp()
            });
          } else {
            await updateDoc(doc(db, 'users', uid), {
              displayName: displayName,
              username: username,
              updatedAt: serverTimestamp()
            });
          }
        } catch (error) {
          handleFirestoreError(error, OperationType.UPDATE, userPath);
        }

        // Sync display name on leaderboard entry if the player already has a score document
        const scorePath = 'scores/' + uid;
        try {
          const scoreSnap = await getDoc(doc(db, 'scores', uid));
          if (scoreSnap.exists()) {
            await updateDoc(doc(db, 'scores', uid), {
              name: displayName,
              updatedAt: serverTimestamp()
            });
          }
        } catch (error) {
          handleFirestoreError(error, OperationType.UPDATE, scorePath);
        }

        return { displayName: displayName, username: username };
      }

      async function deleteUserAccountData(uid) {
        const userPath = 'users/' + uid;
        const scorePath = 'scores/' + uid;
        try {
          await Promise.all([
            deleteDoc(doc(db, 'users', uid)),
            deleteDoc(doc(db, 'scores', uid))
          ]);
        } catch (error) {
          handleFirestoreError(error, OperationType.DELETE, userPath + ' & ' + scorePath);
        }
      }

      function subscribePersonalBest(uid, onValue) {
        const path = 'scores/' + uid;
        return onSnapshot(
          doc(db, 'scores', uid),
          function (snap) {
            const data = snap.exists() ? snap.data() : null;
            const score = data && typeof data.score === 'number' ? data.score : 0;
            onValue(score);
          },
          function (error) {
            handleFirestoreError(error, OperationType.GET, path);
          }
        );
      }

      async function getPersonalBest(uid) {
        const path = 'scores/' + uid;
        try {
          const snap = await getDoc(doc(db, 'scores', uid));
          if (!snap.exists()) return 0;
          const data = snap.data();
          return data && typeof data.score === 'number' ? data.score : 0;
        } catch (error) {
          handleFirestoreError(error, OperationType.GET, path);
        }
      }

      async function saveBestScore(uid, rawName, rawScore) {
        const safeScore = sanitizeScore(rawScore);
        const safeName = sanitizeDisplayName(rawName, 'Player');
        const path = 'scores/' + uid;

        try {
          const profileSnap = await getDoc(doc(db, 'users', uid));
          const resolvedName = profileSnap.exists() && profileSnap.data().displayName
            ? sanitizeDisplayName(profileSnap.data().displayName, safeName)
            : safeName;

          const scoreRef = doc(db, 'scores', uid);
          const existingSnap = await getDoc(scoreRef);

          if (existingSnap.exists()) {
            const currentScore = Number(existingSnap.data().score) || 0;
            if (safeScore < currentScore) {
              return currentScore;
            }
            await updateDoc(scoreRef, {
              name: resolvedName,
              score: safeScore,
              updatedAt: serverTimestamp()
            });
          } else {
            await setDoc(scoreRef, {
              uid: uid,
              name: resolvedName,
              score: safeScore,
              updatedAt: serverTimestamp()
            });
          }
          return safeScore;
        } catch (error) {
          handleFirestoreError(error, OperationType.WRITE, path);
        }
      }

      async function getTopScores(maxCount) {
        const path = 'scores';
        try {
          const q = query(
            collection(db, 'scores'),
            where('score', '>=', 0),
            orderBy('score', 'desc'),
            limit(maxCount || 5)
          );
          const snapshot = await getDocs(q);
          const players = [];
          snapshot.forEach(function (docSnap) {
            players.push(Object.assign({ uid: docSnap.id }, docSnap.data()));
          });
          return players;
        } catch (error) {
          handleFirestoreError(error, OperationType.LIST, path);
        }
      }

      return {
        app: app,
        auth: auth,
        db: db,
        OperationType: OperationType,
        handleFirestoreError: handleFirestoreError,
        signInWithGoogle: signInWithGoogle,
        signOutUser: signOutUser,
        onAuthChange: onAuthChange,
        getUserProfile: getUserProfile,
        createUserProfile: createUserProfile,
        updateUserProfile: updateUserProfile,
        deleteUserAccountData: deleteUserAccountData,
        subscribePersonalBest: subscribePersonalBest,
        getPersonalBest: getPersonalBest,
        saveBestScore: saveBestScore,
        getTopScores: getTopScores
      };
    })();

    return initPromise;
  };
})(window);
