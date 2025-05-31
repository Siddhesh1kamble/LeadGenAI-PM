import React, { useState, useEffect, useRef } from "react";
import axios from "axios";

export default function App() {
  const [file, setFile] = useState(null);
  const [fileId, setFileId] = useState(null);
  const [rawPreviewText, setRawPreviewText] = useState(""); // raw file content preview 
  const [summary, setSummary] = useState("");
  const [query, setQuery] = useState("");
  const [chat, setChat] = useState([
    { sender: "bot", text: "Welcome! Upload a data file and ask me anything about it." },
  ]);
  const [previewUrl, setPreviewUrl] = useState(null);
  const chatEndRef = useRef(null);

  // Scroll to bottom on new message
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat]);

  // On file select, generate preview content 
  const handleFileChange = async (e) => {
    const selectedFile = e.target.files[0];
    setFile(selectedFile);
    setFileId(null);
    setSummary("");
    setChat([
      { sender: "bot", text: "Welcome! Upload a data file and ask me anything about it." },
    ]);
    setPreviewUrl(null);
    setRawPreviewText("");

    if (!selectedFile) return;

    const ext = selectedFile.name.split(".").pop().toLowerCase();
    setPreviewUrl(URL.createObjectURL(selectedFile));

    if (ext === "pdf") {
     
      setRawPreviewText(""); 
    } else if (ext === "csv" || ext === "txt") {
      // Read file as text for preview
      const text = await selectedFile.text();
      setRawPreviewText(text.slice(0, 10000)); // limit preview size
    } else if (ext === "xlsx" || ext === "xls") {
      // Read Excel file as JSON string for preview
      try {
        const data = await readExcelFileAsJson(selectedFile);
        setRawPreviewText(JSON.stringify(data, null, 2).slice(0, 10000));
      } catch {
        setRawPreviewText("Cannot preview this XLSX file.");
      }
    } else {
      setRawPreviewText("No preview available for this file type.");
    }
  };

  // Helper to read Excel file as JSON on client 
  async function readExcelFileAsJson(file) {
    const XLSX = await import("xlsx");
    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: "array" });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    return XLSX.utils.sheet_to_json(worksheet);
  }

  const uploadFile = async () => {
    if (!file) return alert("Please select a file first.");
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await axios.post("http://localhost:5000/upload", formData);
      setFileId(res.data.fileId);
      setSummary(res.data.summary);

      // Show summary 
      setChat((prev) => [
        ...prev,
        { sender: "bot", text: "File uploaded and summarized! Here's the summary:" },
        { sender: "bot", text: res.data.summary },
      ]);
    } catch (error) {
      alert("Upload failed.");
    }
  };

  const sendQuery = async () => {
    if (!query.trim()) return;
    if (!fileId) return alert("Please upload a file first.");

    setChat((prev) => [...prev, { sender: "user", text: query }]);
    setQuery("");

    try {
      const res = await axios.post("http://localhost:5000/query", { query, fileId });
      setChat((prev) => [...prev, { sender: "bot", text: res.data.answer }]);
    } catch (error) {
      setChat((prev) => [...prev, { sender: "bot", text: "Error getting response." }]);
    }
  };

  // Render preview for supported files
  const renderPreview = () => {
    if (!file) return <div>Select a file to preview</div>;
    const ext = file.name.split(".").pop().toLowerCase();

    if (ext === "pdf") {
      return (
        <iframe
          title="pdf-preview"
          src={previewUrl}
          style={{ width: "100%", height: "100%", borderRadius: "8px", border: "none" }}
        />
      );
    } else if (ext === "csv" || ext === "txt" || ext === "xlsx" || ext === "xls") {
      return (
        <pre
          style={{
            whiteSpace: "pre-wrap",
            overflowY: "auto",
            maxHeight: "100%",
            fontSize: "14px",
            margin: 0,
          }}
        >
          {rawPreviewText || "No preview available"}
        </pre>
      );
    } else {
      return <div>No preview available for this file type.</div>;
    }
  };

  return (
    <div className="container">
      <div className="preview-area">
        <h3>File Preview</h3>
        <div className="preview-content">{renderPreview()}</div>
        <input
          type="file"
          onChange={handleFileChange}
          className="file-input"
          accept=".csv,.txt,.xlsx,.xls,.pdf"
        />
        <button className="upload-btn" onClick={uploadFile}>
          Upload & Summarize
        </button>
      </div>

      <div className="chat-area">
        <h3>Chatbot</h3>
        <div className="chat-box">
          {chat.map((msg, i) => (
            <div
              key={i}
              className={`chat-message ${msg.sender === "user" ? "user-msg" : "bot-msg"}`}
            >
              {msg.text}
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>

        <div className="input-area">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendQuery()}
            placeholder="Ask a question..."
          />
          <button onClick={sendQuery}>Send</button>
        </div>
      </div>
    </div>
  );
}
