import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { globalIgnores } from 'eslint/config'

export default tseslint.config([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      // react-hooks v7 folded the React Compiler rules into `recommended`.
      // Off until we decide to adopt the compiler — enable deliberately, not by upgrade.
      'react-hooks/static-components': 'off',
      'react-hooks/use-memo': 'off',
      'react-hooks/preserve-manual-memoization': 'off',
      'react-hooks/incompatible-library': 'off',
      'react-hooks/immutability': 'off',
      'react-hooks/globals': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/error-boundaries': 'off',
      'react-hooks/purity': 'off',
      'react-hooks/set-state-in-render': 'off',
      'react-hooks/unsupported-syntax': 'off',
      'react-hooks/config': 'off',
      'react-hooks/gating': 'off',
    },
  },
  {
    // Every Firestore write must also reach the SQLite shadow, so writes go
    // through src/api/shadow.ts. A raw write is silent drift in the migration.
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/api/shadow.ts', 'src/utils/firestoreMetrics.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        paths: [{
          name: 'firebase/firestore',
          importNames: ['addDoc', 'setDoc', 'updateDoc', 'deleteDoc', 'writeBatch', 'runTransaction',
            'serverTimestamp', 'increment', 'arrayUnion', 'arrayRemove', 'deleteField'],
          message: 'Write through src/api/shadow.ts (*Shadowed wrappers, SERVER_TIME/incrementBy/… markers) so the SQLite shadow sees it.',
        }],
        patterns: [{
          group: ['**/firestoreMetrics'],
          importNames: ['trackedAddDoc', 'trackedSetDoc', 'trackedUpdateDoc', 'trackedDeleteDoc', 'trackedWriteBatch'],
          message: 'Write through src/api/shadow.ts so the SQLite shadow sees it.',
        }],
      }],
    },
  },
])
