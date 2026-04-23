# FaithConnect - Church Media Department System

A production-ready church media management system built with React, TypeScript, Vite, and Firebase.

## Features

- 🎥 **Content Ideas Management** - Submit, score, and track content ideas with AI assistance
- 📌 **Task Board** - Real-time task tracking for the whole team
- ✅ **Checklists** - Sunday and midweek service preparation checklists
- 🎛️ **Equipment Management** - Track equipment, conditions, and checkout logs
- 📊 **Performance Analytics** - Monitor social media performance
- 🤖 **AI-Powered Features** - AI caption generation, idea suggestions, and content scoring
- 🔐 **Firebase Authentication** - Secure team account management
- 📱 **Real-time Updates** - Live Firestore listeners for instant data sync

## Setup

### Prerequisites

- Node.js 16+
- A Firebase project (already configured in code)
- An Anthropic API key (for AI features)

### Installation

1. Install dependencies:
```bash
npm install
```

2. **Set up your OpenAI API key** for AI features (optional but recommended):
   - Get an API key from [OpenAI Platform](https://platform.openai.com/api-keys)
   - Create a `.env.local` file in the project root:
   ```
   VITE_OPENAI_KEY=your_openai_api_key_here
   ```
   - See `.env.example` for reference

3. Start the development server:
```bash
npm run dev
```

### First Time Setup

When you first log in:
1. Click "Create admin account" on the login page
2. Create your account with your email and password
3. Add team members later from the Admin panel

## AI Features

The following features require a valid `VITE_OPENAI_KEY`:

- **AI Suggest** - Generate 4 content ideas from a sermon theme
- **AI Caption Generator** - Create social media captions with hashtags and CTAs
- **AI Idea Scoring** - Automatic AI scoring when submitting ideas

If you don't have an API key, the app will still work, but AI features will be disabled.

## Development

```bash
npm run dev      # Start dev server
npm run build    # Build for production
npm run lint     # Run ESLint
npm run preview  # Preview production build
```

## Tech Stack

- **Frontend**: React 19, TypeScript, Vite
- **Backend**: Firebase (Auth, Firestore)
- **AI**: OpenAI GPT-4o-mini API
- **Styling**: Inline CSS with custom design system
- **Fonts**: Syne, Instrument Sans (Google Fonts)

---

**FaithConnect** - Making church media management simple and powerful.

import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

