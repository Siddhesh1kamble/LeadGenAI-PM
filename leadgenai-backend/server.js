require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const Papa = require('papaparse');
const XLSX = require('xlsx');
const pdfParse = require('pdf-parse');
const { OpenAI } = require('openai');

const app = express();
app.use(cors());
app.use(express.json());

// GROQ-compatible OpenAI client
const openai = new OpenAI({
  baseURL: "https://api.groq.com/openai/v1",
  apiKey: process.env.GROQ_API_KEY,
});

// Multer setup (for file uploads)
const upload = multer({ storage: multer.memoryStorage() });

// In-memory store for uploaded data & chat history (you can later use DB)
const dataStore = {}; // key: fileId, value: { rawData, summary, chatHistory }

async function parseFile(file) {
  const ext = path.extname(file.originalname).toLowerCase();

  if (ext === '.csv' || ext === '.txt') {
    const text = file.buffer.toString('utf8');
    const parsed = Papa.parse(text, { header: true });
    return parsed.data;
  }

  if (ext === '.xlsx' || ext === '.xls') {
    const workbook = XLSX.read(file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    return XLSX.utils.sheet_to_json(worksheet);
  }

  if (ext === '.pdf') {
    const data = await pdfParse(file.buffer);
    return [{ text: data.text }];
  }

  throw new Error('Unsupported file type');
}

// Upload Route
app.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const parsedData = await parseFile(req.file);
    const rawDataStr = JSON.stringify(parsedData).slice(0, 1500);

    const prompt = `You are a data assistant. Summarize this dataset:\n${rawDataStr}`;
    const summaryResp = await openai.chat.completions.create({
      model: "llama3-70b-8192",
      messages: [
        { role: "system", content: "You are a helpful assistant that summarizes datasets." },
        { role: "user", content: prompt }
      ]
    });

    const summary = summaryResp.choices[0].message.content;
    const fileId = Date.now().toString();

    dataStore[fileId] = {
      rawData: parsedData,
      summary,
      chatHistory: [
        { role: "system", content: "You are a helpful assistant answering questions about a dataset." },
        { role: "user", content: `Dataset summary:\n${summary}` }
      ],
    };

    res.json({ fileId, summary });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Error processing file' });
  }
});

// Query Route (with multiturn context)
app.post('/query', async (req, res) => {
  const { query, fileId } = req.body;

  if (!query || !fileId || !dataStore[fileId]) {
    return res.status(400).json({ error: 'Missing query or invalid fileId' });
  }

  try {
    // Add new user message to history
    const chatHistory = dataStore[fileId].chatHistory;
    chatHistory.push({ role: "user", content: query });

    // Send entire chatHistory to GROQ
    const response = await openai.chat.completions.create({
      model: "llama3-70b-8192",
      messages: chatHistory,
    });

    const reply = response.choices[0].message.content;

    // Save model reply to history
    chatHistory.push({ role: "assistant", content: reply });

    res.json({ answer: reply });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to get response from GROQ API' });
  }
});

// Health check
app.get('/', (req, res) => {
  res.send('Backend running');
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
});
