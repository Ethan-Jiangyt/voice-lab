# Voice Lab - Gold Standard Check

A React application for comparing TTS (Text-to-Speech) voice samples against a gold standard using Google's Gemini AI.

## Setup Instructions

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure API Key

You need a Google Gemini API key to use this application.

1. Get your API key from [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Open the `.env.local` file in the project root
3. Replace `your_api_key_here` with your actual API key:

```
VITE_GEMINI_API_KEY=your_actual_api_key_here
```

### 3. Run the Application

```bash
npm run dev
```

The application will open in your browser at `http://localhost:5173`

## How to Use

1. **Upload Golden Master**: Upload your reference audio file (the "perfect" voice sample)
2. **Upload Test Candidate**: Upload the new audio file you want to compare
3. **Optional**: Add character description and script text for better analysis
4. **Click "Check Deviation"**: The AI will analyze and compare both audio files

## Features

- Audio file comparison using Gemini 2.5 Flash
- Detailed analysis of:
  - Intonation and emphasis
  - Pacing and timing
  - Timbre and texture
- Visual scoring and grading system
- Deviation report with specific issues

## Build for Production

```bash
npm run build
```

The built files will be in the `dist` directory.
