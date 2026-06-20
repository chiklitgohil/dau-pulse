# DAU Pulse 🎓⚡

> **AI-Powered Campus Intelligence via WhatsApp**

**Public Deployment Link**: [https://dau-pulse.vercel.app/](https://dau-pulse.vercel.app/)
**GitHub Repository**: [https://github.com/chiklitgohil/dau-pulse](https://github.com/chiklitgohil/dau-pulse)

DAU Pulse transforms chaotic, scattered student complaints into structured, actionable campus intelligence. By integrating directly into WhatsApp—the app every student already uses—we remove the friction of reporting issues. Our AI layer automatically clusters similar complaints, extracts locations, and assigns urgency scores, allowing campus administrators to resolve critical problems faster.

## 🚀 Key Features
- **WhatsApp Integration**: Zero-app-install reporting system. Students just send a message.
- **AI Triage (Gemini 2.5 Flash)**: Automatically categorizes text into departments (Academic, Hostel, Tech Support, etc.).
- **Smart Clustering**: Groups identical reports (e.g., 5 students reporting the same broken Wi-Fi router) to prevent admin fatigue.
- **Urgency Scoring**: Detects keywords like "harassment" or "pipe burst" and flags them with high urgency.
- **Admin Dashboard**: A sleek, real-time command center for administrators to view, track, and resolve issues.

---

## 🛠️ Technology Stack & AI Disclosure

As part of the Buildathon requirements, here is the full disclosure of tools, models, and APIs used in this project:

- **Frontend & Backend**: [Next.js 15 (App Router)](https://nextjs.org/) with React and TailwindCSS.
- **Database**: [Vercel KV (Upstash Redis)](https://vercel.com/docs/storage/vercel-kv) for low-latency, persistent edge storage.
- **Primary AI Model**: [Google Gemini 2.5 Flash API](https://ai.google.dev/). We use Gemini for NLP processing (categorizing, scoring urgency, and generating cluster summaries based on student text).
- **Communication API**: [Meta WhatsApp Cloud API (v25.0)](https://developers.facebook.com/docs/whatsapp/cloud-api) for receiving webhooks and sending automated replies to students.
- **Deployment**: [Vercel](https://vercel.com/).

---

## 📦 Running Locally

1. **Clone the repository**
   ```bash
   git clone <repo-url>
   cd dau-pulse
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up Environment Variables**
   Create a `.env` file in the root directory:
   ```env
   # Database (Vercel KV)
   KV_REST_API_URL=your_upstash_url
   KV_REST_API_TOKEN=your_upstash_token

   # Meta WhatsApp API
   WHATSAPP_ACCESS_TOKEN=your_meta_token
   WHATSAPP_PHONE_NUMBER_ID=your_phone_id
   WHATSAPP_VERIFY_TOKEN=dau_pulse_secret_token

   # Google Gemini
   GEMINI_API_KEY=your_gemini_api_key
   ```

4. **Run the development server**
   ```bash
   npm run dev
   ```
   Open `http://localhost:3000` in your browser.

---

## 📂 Project Structure
- `src/app/api/webhook/route.ts`: Core WhatsApp webhook receiver and processing pipeline.
- `src/lib/ai.ts`: Gemini LLM prompt engineering and clustering logic.
- `src/app/admin/page.tsx`: Administrator dashboard UI.
- `Blog.md`: Our team's story and vision.
- `docs/ProjectDocumentation.md`: Detailed architectural documentation.
