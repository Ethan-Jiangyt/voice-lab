import React, { useState } from 'react';
import { Upload, Activity, AlertCircle, CheckCircle2, BrainCircuit, Trophy, Fingerprint, ArrowRight } from 'lucide-react';

// --- Types ---

interface AnalysisResult {
  similarity_score: number;
  quality_grade: string;
  verdict_summary: string;
  comparison_points: {
    intonation_match: string;
    pacing_match: string;
    timbre_match: string;
  };
  flaws_detected_in_candidate: string[];
  is_improvement: boolean;
}

interface FileUploadProps {
  label: string;
  file: File | null;
  setFile: (file: File | null) => void;
  disabled?: boolean;
  isGolden?: boolean;
}

// --- Helper Components ---

const FileUpload: React.FC<FileUploadProps> = ({ label, file, setFile, disabled, isGolden }) => (
  <div className={`relative border-2 border-dashed rounded-xl p-6 transition-colors text-center group ${file ? (isGolden ? 'border-amber-400 bg-amber-50/30' : 'border-indigo-400 bg-indigo-50/30') : 'border-slate-300 hover:border-indigo-400 hover:bg-slate-50'}`}>
    <input 
      type="file" 
      accept="audio/*" 
      onChange={(e) => setFile(e.target.files?.[0] || null)}
      disabled={disabled}
      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10 disabled:cursor-not-allowed"
    />
    <div className="flex flex-col items-center justify-center">
      <div className={`p-3 rounded-full shadow-sm mb-3 ${file ? (isGolden ? 'bg-amber-100 text-amber-600' : 'bg-indigo-100 text-indigo-600') : 'bg-white text-slate-400'}`}>
        {file ? <CheckCircle2 size={24} /> : <Upload size={24} />}
      </div>
      <div className="font-medium text-slate-700 truncate max-w-[200px]">
        {file ? file.name : label}
      </div>
      {!file && <span className="text-xs text-slate-400 mt-1">Click to upload</span>}
    </div>
    {isGolden && file && (
      <div className="absolute top-2 right-2 text-amber-500">
        <Trophy size={16} />
      </div>
    )}
  </div>
);

export default function GeminiTTSBenchmark() {
  // State
  const [goldenFile, setGoldenFile] = useState<File | null>(null); 
  const [testFile, setTestFile] = useState<File | null>(null); 
  
  // Context
  const [referenceText, setReferenceText] = useState("");
  const [characterDesc, setCharacterDesc] = useState("Narrator");
  
  // Analysis
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [results, setResults] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Constants
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY || ""; 

  // --- Logic ---

  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.split(',')[1]);
      };
      reader.onerror = error => reject(error);
    });
  };

  const runAnalysis = async () => {
    if (!goldenFile || !testFile) {
      setError("Both In-Game Reference and New TTS files are required.");
      return;
    }

    setIsAnalyzing(true);
    setError(null);
    setResults(null);

    try {
      const goldenB64 = await fileToBase64(goldenFile);
      const testB64 = await fileToBase64(testFile);

      // --- STRICT "IN-GAME REFERENCE" PROMPT ---
      const systemInstruction = `
        You are a QA Lead for Character Voice Production.
        
        ROLE:
        You will receive two audio files.
        File A is the "IN-GAME REFERENCE". It represents the proven, production-ready voice used in the game.
        File B is a "NEW TTS GENERATION". 
        
        YOUR JOB:
        Compare B *against* A. 
        Do not critique A. A is the law. A is the target.
        Critique B based ONLY on how well it reproduces the qualities of A.
        
        STRICT FAIL CONDITIONS (Automatic Low Score):
        - If B stresses words differently than A: PENALIZE.
        - If B has robotic "micro-pauses" that A does not have: PENALIZE.
        - If B sounds older/younger or more synthetic than A: PENALIZE.
        - If B is breathless or rushed compared to A: PENALIZE.
      `;

      const userPrompt = `
        Context:
        Character: ${characterDesc}
        Script: "${referenceText || "No script provided"}"

        Task:
        1. Listen to the In-Game Reference (A) to establish the baseline for pitch, speed, and emotion.
        2. Listen to the New TTS (B).
        3. List every specific moment where B fails to match A's quality.

        Output strictly valid JSON:
        {
          "similarity_score": number (0-100),
          "quality_grade": "S" | "A" | "B" | "C" | "F",
          "verdict_summary": "string (1 sentence verdict)",
          "comparison_points": {
             "intonation_match": "string (comment on pitch curve)",
             "pacing_match": "string (comment on pauses/speed)",
             "timbre_match": "string (comment on voice age/texture)"
          },
          "flaws_detected_in_candidate": [
             "string", "string"
          ],
          "is_improvement": boolean (only true if B is actually objectively clearer/better than A)
        }
      `;

      // --- RETRY LOGIC WITH EXPONENTIAL BACKOFF ---
      const maxRetries = 5;
      let attempt = 0;
      let success = false;
      let data;

      while (attempt < maxRetries && !success) {
        try {
          const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: systemInstruction }] },
              contents: [{
                parts: [
                  { text: userPrompt },
                  { inlineData: { mimeType: goldenFile.type || "audio/wav", data: goldenB64 } },
                  { inlineData: { mimeType: testFile.type || "audio/wav", data: testB64 } }
                ]
              }],
              generationConfig: { responseMimeType: "application/json" }
            })
          });

          // Check for 503 Service Unavailable (overloaded)
          if (response.status === 503) {
            throw new Error("Model is overloaded");
          }

          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error?.message || "API Error");
          }

          data = await response.json();
          if (data.error) throw new Error(data.error.message);
          success = true;

        } catch (err) {
          attempt++;
          if (attempt === maxRetries) throw err; // Give up after 5 tries
          
          const waitTime = attempt * 2000; // 2s, 4s, 6s, 8s, 10s
          console.log(`Attempt ${attempt} failed. Retrying in ${waitTime / 1000} seconds...`);
          setError(`Server busy, retrying (${attempt}/${maxRetries})...`);
          await delay(waitTime);
        }
      }
      // --- END RETRY LOGIC ---
      
      const jsonResult = JSON.parse(data.candidates?.[0]?.content?.parts?.[0]?.text || "{}") as AnalysisResult;
      setResults(jsonResult);

    } catch (err) {
      console.error(err);
      const errorMessage = err instanceof Error ? err.message : "Analysis failed.";
      setError(`Error: ${errorMessage}. Please try again in a moment.`);
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans p-4 md:p-8">
      <div className="max-w-5xl mx-auto">
        
        {/* Header */}
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
            <Fingerprint className="text-amber-500" size={32} />
            Voice Lab: TTS Quality Check
          </h1>
          <p className="text-slate-500 mt-1">Compare new TTS generations against your in-game voice assets.</p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Controls */}
          <div className="lg:col-span-5 space-y-6">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              
              {/* Context */}
              <div className="mb-6 space-y-4">
                 <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Character Archetype</label>
                    <input 
                      type="text"
                      value={characterDesc}
                      onChange={(e) => setCharacterDesc(e.target.value)}
                      className="w-full p-2.5 text-sm border border-slate-200 rounded-lg"
                      placeholder="e.g. Grumpy Wizard, Energetic Teen"
                    />
                 </div>
                 <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Script (Optional)</label>
                    <textarea 
                      value={referenceText}
                      onChange={(e) => setReferenceText(e.target.value)}
                      placeholder="Paste text to help AI check word emphasis..."
                      className="w-full p-3 text-sm border border-slate-200 rounded-lg h-20 resize-none"
                    />
                 </div>
              </div>
              
              <div className="h-px bg-slate-100 my-6" />

              {/* Uploads */}
              <div className="space-y-6">
                <div>
                  <h3 className="font-bold text-amber-700 flex items-center gap-2 mb-2">
                    <Trophy size={16} /> In-Game Reference
                  </h3>
                  <p className="text-xs text-slate-500 mb-3">
                    Upload your <b>current in-game voice</b>. The AI will use this as the quality baseline.
                  </p>
                  <FileUpload label="Upload In-Game TTS" file={goldenFile} setFile={setGoldenFile} disabled={isAnalyzing} isGolden={true} />
                </div>

                <div className="flex justify-center text-slate-300">
                  <ArrowRight className="rotate-90" />
                </div>

                <div>
                  <h3 className="font-bold text-indigo-700 flex items-center gap-2 mb-2">
                    <Activity size={16} /> New TTS
                  </h3>
                  <p className="text-xs text-slate-500 mb-3">
                    Upload the <b>new TTS generation</b> you want to compare.
                  </p>
                  <FileUpload label="Upload New TTS" file={testFile} setFile={setTestFile} disabled={isAnalyzing} isGolden={false} />
                </div>
              </div>

              <button
                onClick={runAnalysis}
                disabled={isAnalyzing || !goldenFile || !testFile}
                className="w-full mt-6 py-4 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white rounded-xl font-bold shadow-lg transition-all active:scale-[0.98] flex justify-center items-center gap-2"
              >
                {isAnalyzing ? <Activity className="animate-spin" /> : <BrainCircuit size={20} />}
                {isAnalyzing ? "comparing signal..." : "Check Deviation"}
              </button>
              
              {error && (
                <div className="mt-4 p-3 bg-red-50 text-red-600 text-sm rounded-lg flex items-center gap-2">
                  <AlertCircle size={16} /> {error}
                </div>
              )}
            </div>
          </div>

          {/* Results */}
          <div className="lg:col-span-7">
            {!results && !isAnalyzing && (
              <div className="h-full min-h-[500px] flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-xl bg-slate-50/50 text-slate-400 p-8 text-center">
                <Fingerprint size={48} className="mb-4 opacity-50" />
                <h3 className="text-lg font-semibold mb-2">Quality Analysis</h3>
                <p className="max-w-sm text-sm">
                  Compare how well your new TTS matches the in-game reference.
                  Detects robotic artifacts, wrong emphasis, and voice quality issues.
                </p>
              </div>
            )}

            {isAnalyzing && (
               <div className="h-full min-h-[500px] flex flex-col items-center justify-center bg-white rounded-xl shadow-sm border border-slate-200">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mb-6"></div>
                  <p className="text-slate-800 font-bold text-lg">Analyzing Audio...</p>
                  <p className="text-sm text-slate-500 mt-2">Comparing against in-game reference</p>
               </div>
            )}

            {results && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
                
                {/* Score Header */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                  <div className="bg-slate-900 text-white p-6 flex justify-between items-center">
                    <div>
                      <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Result</div>
                      <h2 className="text-2xl font-bold text-white">{results.quality_grade} Grade Candidate</h2>
                    </div>
                    <div className="text-right">
                      <div className={`text-4xl font-black ${results.similarity_score > 80 ? 'text-green-400' : results.similarity_score > 60 ? 'text-amber-400' : 'text-red-400'}`}>
                        {results.similarity_score}%
                      </div>
                      <div className="text-xs text-slate-400 uppercase">Match Score</div>
                    </div>
                  </div>
                  <div className="p-6 bg-slate-50 border-b border-slate-100">
                     <p className="text-slate-700 font-medium italic">"{results.verdict_summary}"</p>
                  </div>
                </div>

                {/* Deviation Grid */}
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                    <h3 className="text-xs font-bold text-slate-400 uppercase mb-3">Intonation & Emphasis</h3>
                    <p className="text-sm text-slate-700 leading-relaxed">{results.comparison_points.intonation_match}</p>
                  </div>
                  <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                    <h3 className="text-xs font-bold text-slate-400 uppercase mb-3">Timbre & Texture</h3>
                    <p className="text-sm text-slate-700 leading-relaxed">{results.comparison_points.timbre_match}</p>
                  </div>
                </div>

                {/* Flaw List */}
                <div className="bg-white rounded-xl border border-red-100 shadow-sm overflow-hidden">
                   <div className="bg-red-50/50 px-6 py-3 border-b border-red-100 flex items-center justify-between">
                      <h3 className="font-bold text-red-900 flex items-center gap-2">
                        <AlertCircle size={18} /> Deviation Report
                      </h3>
                      <span className="text-xs font-bold text-red-700 px-2 py-1 bg-white rounded-md border border-red-100">
                        {results.flaws_detected_in_candidate.length} Issues
                      </span>
                   </div>
                   <div className="p-6">
                      {results.flaws_detected_in_candidate.length > 0 ? (
                        <ul className="space-y-3">
                          {results.flaws_detected_in_candidate.map((flaw, i) => (
                            <li key={i} className="flex gap-3 text-sm text-slate-700">
                              <span className="text-red-400 font-bold">•</span>
                              {flaw}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <div className="flex items-center gap-2 text-green-600 text-sm font-medium">
                          <CheckCircle2 size={18} /> Perfect match. No significant deviations found.
                        </div>
                      )}
                   </div>
                </div>

              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}