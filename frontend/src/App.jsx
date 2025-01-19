import { useState, useRef, useEffect } from "react";
import axios from "axios";
import "./App.css";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5510";

const FORMAT_LABELS = {
  txt: {
    label: "Plain Text",
    icon: "📄",
    description: "Best for reading and editing",
  },
  vtt: {
    label: "Web Subtitles",
    icon: "🎬",
    description: "For web video players",
  },
  srt: {
    label: "Universal Subtitles",
    icon: "🎥",
    description: "For most video players",
  },
  tsv: { label: "Spreadsheet", icon: "📊", description: "For data analysis" },
  json: {
    label: "JSON Format",
    icon: "⚙️",
    description: "Complete transcription data",
  },
};

const formatTimestamp = (seconds) => {
  const pad = (num) => String(num).padStart(2, "0");
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${pad(hours)}:${pad(minutes)}:${pad(secs)}.${String(ms).padStart(
    3,
    "0"
  )}`;
};

function App() {
  const [file, setFile] = useState(null);
  const [transcription, setTranscription] = useState("");
  const [segments, setSegments] = useState([]);
  const [formats, setFormats] = useState(null);
  const [filename, setFilename] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [transcriptionTime, setTranscriptionTime] = useState(0);
  const [currentSegmentIndex, setCurrentSegmentIndex] = useState(-1);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [availableModels, setAvailableModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState("turbo");
  const [temperature, setTemperature] = useState(0.0);
  const [noSpeechThreshold, setNoSpeechThreshold] = useState(0.8);
  const [hallucinationSilenceThreshold, setHallucinationSilenceThreshold] =
    useState(2.0);
  const [wordTimestamps, setWordTimestamps] = useState(true);
  const [initialPrompt, setInitialPrompt] = useState("");
  const fileInputRef = useRef(null);
  const audioRef = useRef(null);
  const segmentRefs = useRef([]);
  const segmentsListRef = useRef(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [showAdvancedDialog, setShowAdvancedDialog] = useState(false);

  const resetStates = () => {
    setFile(null);
    setTranscription("");
    setSegments([]);
    setFormats(null);
    setFilename("");
    setError("");
    setLoading(false);
    setAudioUrl(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileChange({ target: { files: e.dataTransfer.files } });
    }
  };

  const handleFileChange = (event) => {
    const selectedFile = event.target.files[0];
    if (
      selectedFile &&
      (selectedFile.type.startsWith("audio/") ||
        selectedFile.type.startsWith("video/"))
    ) {
      setFile(selectedFile);
      setError("");
      // Create URL for audio player
      const url = URL.createObjectURL(selectedFile);
      setAudioUrl(url);
    } else {
      setError("Please select an audio or video file");
    }
  };

  const handleSubmit = async (event) => {
    event?.preventDefault();
    if (!file) {
      setError("Please select an audio file");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);
    formData.append("model", selectedModel);
    formData.append("temperature", temperature);
    formData.append("no_speech_threshold", noSpeechThreshold);
    formData.append(
      "hallucination_silence_threshold",
      hallucinationSilenceThreshold
    );
    formData.append("word_timestamps", wordTimestamps);
    formData.append("initial_prompt", initialPrompt);

    setLoading(true);
    setError("");
    setFormats(null);
    setSegments([]);
    setTranscription("");

    const startTime = Date.now();

    try {
      const response = await axios.post(`${API_URL}/transcribe`, formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
        timeout: 300000, // 5 minutes timeout
      });

      const endTime = Date.now();
      setTranscriptionTime((endTime - startTime) / 1000); // Convert to seconds

      if (response.data) {
        const {
          text,
          segments,
          formats: responseFormats,
          filename: responseFilename,
        } = response.data;
        setTranscription(text || "");
        setSegments(segments || []);
        setFormats(responseFormats || null);
        setFilename(responseFilename || "transcription");

        // 關閉進階設定對話框
        setShowAdvancedDialog(false);
      } else {
        throw new Error("Invalid response format");
      }
    } catch (err) {
      const errorMessage = err.response?.data?.error || err.message;
      setError(`轉錄失敗: ${errorMessage}`);
      setSegments([]);
      setFormats(null);
      setTranscription("");
      setTranscriptionTime(0);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (format) => {
    try {
      const response = await axios.post(
        `${API_URL}/download/${format}`,
        {
          content: formats[format],
          filename: filename || "transcription",
        },
        { responseType: "blob" }
      );

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `${filename || "transcription"}.${format}`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError("Download process error: " + err.message);
    }
  };

  const handleSegmentClick = (startTime) => {
    if (audioRef.current) {
      audioRef.current.currentTime = startTime;
      audioRef.current.play();
    }
  };

  const handleTimeUpdate = () => {
    if (!audioRef.current || segments.length === 0) return;

    const currentTime = audioRef.current.currentTime;
    const newIndex = segments.findIndex((segment, index) => {
      const nextSegment = segments[index + 1];
      return (
        currentTime >= segment.start &&
        (nextSegment
          ? currentTime < nextSegment.start
          : currentTime <= segment.end)
      );
    });

    if (newIndex !== currentSegmentIndex) {
      setCurrentSegmentIndex(newIndex);
      if (
        newIndex >= 0 &&
        segmentRefs.current[newIndex] &&
        segmentsListRef.current
      ) {
        const segmentElement = segmentRefs.current[newIndex];
        const containerElement = segmentsListRef.current;

        // 計算目標捲動位置
        const targetScroll =
          segmentElement.offsetTop - containerElement.offsetTop;

        // 使用平滑捲動
        containerElement.scrollTo({
          top: targetScroll,
          behavior: "smooth",
        });
      }
    }
  };

  useEffect(() => {
    const mediaElement = audioRef.current;
    if (mediaElement) {
      mediaElement.addEventListener("timeupdate", handleTimeUpdate);
      return () => {
        mediaElement.removeEventListener("timeupdate", handleTimeUpdate);
      };
    }
  }, [segments, currentSegmentIndex]);

  useEffect(() => {
    const fetchModels = async () => {
      try {
        const response = await axios.get(`${API_URL}/models`);
        setAvailableModels(response.data);
      } catch (error) {
        console.error("Error fetching models:", error);
      }
    };
    fetchModels();
  }, []);

  const handleModelChange = async (model) => {
    try {
      await axios.post(`${API_URL}/model`, { model });
      setSelectedModel(model);
    } catch (error) {
      setError("Error changing model: " + error.message);
    }
  };

  // 關閉對話框時的處理函數
  const handleCloseDialog = (e) => {
    if (e.target === e.currentTarget) {
      setShowAdvancedDialog(false);
    }
  };

  return (
    <div className="app-container">
      <div className="content-wrapper">
        <header className="app-header">
          <h1>Whisper Audio Transcription</h1>
          <p className="app-description">
            Upload audio or video files for automatic transcription with
            multiple export formats
          </p>
        </header>

        <main className="main-content">
          <form
            onSubmit={handleSubmit}
            className="upload-section"
            onDragEnter={handleDrag}
          >
            <div
              className={`drop-zone ${dragActive ? "drag-active" : ""} ${
                file ? "has-file" : ""
              }`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
            >
              <input
                ref={fileInputRef}
                type="file"
                onChange={handleFileChange}
                accept="audio/*,video/*"
                className="file-input"
              />
              {!file ? (
                <>
                  <div className="upload-icon">
                    <svg
                      width="64"
                      height="64"
                      viewBox="0 0 24 24"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z"
                        stroke="var(--primary-100)"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <path
                        d="M12 8V16"
                        stroke="var(--primary-100)"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <path
                        d="M8 12H16"
                        stroke="var(--primary-100)"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                  <div className="upload-text">
                    <strong>Drop files here</strong>
                    <span>or</span>
                    <button
                      type="button"
                      className="browse-button"
                      onClick={() => fileInputRef.current.click()}
                    >
                      Browse Files
                    </button>
                  </div>
                  <div className="upload-hint">
                    Supported formats: MP3, WAV, M4A, MP4...
                  </div>
                </>
              ) : (
                <div className="file-info">
                  <div className="file-icon">
                    <svg
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        d="M12 2L20 7V17L12 22L4 17V7L12 2Z"
                        stroke="var(--primary-100)"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <path
                        d="M12 22V12"
                        stroke="var(--primary-100)"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <path
                        d="M20 7L12 12L4 7"
                        stroke="var(--primary-100)"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                  <div className="file-name">{file.name}</div>
                  <div className="file-size">
                    {(file.size / (1024 * 1024)).toFixed(2)} MB
                  </div>
                  <button
                    type="button"
                    className="remove-file"
                    onClick={() => setFile(null)}
                  >
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        d="M18 6L6 18"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <path
                        d="M6 6L18 18"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                </div>
              )}
            </div>

            {file && (
              <button
                type="submit"
                className={`transcribe-button ${loading ? "loading" : ""}`}
                disabled={loading}
              >
                {loading ? (
                  <>
                    <div className="spinner"></div>
                    <span>Transcribing...</span>
                  </>
                ) : (
                  <>
                    <span>Start Transcription</span>
                  </>
                )}
              </button>
            )}

            {error && <div className="error-message">{error}</div>}
          </form>

          {file && (
            <button
              type="button"
              className="advanced-settings-button"
              onClick={() => setShowAdvancedDialog(true)}
            >
              <span className="settings-icon">⚙️</span>
              Advanced Settings
            </button>
          )}

          {segments.length > 0 && (
            <div className="results-section">
              <div className="transcription-container">
                <div className="transcription-header">
                  <h2>Transcription Results</h2>
                  <span className="transcription-time">
                    Processing Time: {transcriptionTime.toFixed(1)} seconds
                  </span>
                </div>

                <div className="media-player-wrapper">
                  {file?.type.startsWith("video/") ? (
                    <video ref={audioRef} controls className="video-player">
                      <source src={audioUrl} type={file?.type} />
                      Your browser does not support video playback.
                    </video>
                  ) : (
                    <audio ref={audioRef} controls className="audio-player">
                      <source src={audioUrl} type={file?.type} />
                      Your browser does not support audio playback.
                    </audio>
                  )}
                </div>

                <div className="segments-list" ref={segmentsListRef}>
                  {segments.map((segment, index) => (
                    <div
                      key={index}
                      ref={(el) => (segmentRefs.current[index] = el)}
                      className={`segment-item ${
                        index === currentSegmentIndex ? "segment-active" : ""
                      }`}
                      onClick={() => handleSegmentClick(segment.start)}
                      title="Click to play this segment"
                    >
                      <div className="segment-header">
                        <span className="segment-time">
                          <span className="play-icon">▶</span>
                          {formatTimestamp(segment.start)} →{" "}
                          {formatTimestamp(segment.end)}
                        </span>
                        <span className="segment-duration">
                          {(segment.end - segment.start).toFixed(1)} seconds
                        </span>
                      </div>
                      <div className="segment-content">
                        {segment.text.trim()}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {formats && (
                <div className="export-container">
                  <h2>Export Options</h2>
                  <div className="format-grid">
                    {Object.entries(FORMAT_LABELS).map(
                      ([format, { label, icon, description }]) => (
                        <button
                          key={format}
                          className="format-card"
                          onClick={() => handleDownload(format)}
                        >
                          <div className="format-icon">{icon}</div>
                          <div className="format-info">
                            <strong>{label}</strong>
                            <span>{description}</span>
                          </div>
                        </button>
                      )
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {showAdvancedDialog && (
            <div className="dialog-overlay" onClick={handleCloseDialog}>
              <div className="dialog-content">
                <div className="dialog-header">
                  <h3>Advanced Settings</h3>
                  <button
                    className="close-button"
                    onClick={() => setShowAdvancedDialog(false)}
                  >
                    ×
                  </button>
                </div>

                <div className="dialog-body">
                  <div className="control-group">
                    <label>Initial Prompt</label>
                    <div className="prompt-container">
                      <textarea
                        className="prompt-input"
                        value={initialPrompt}
                        onChange={(e) => setInitialPrompt(e.target.value)}
                        placeholder="Enter initial prompt to improve transcription accuracy..."
                        rows={3}
                      />
                      <div className="prompt-description">
                        Provide context or specific terminology to help the
                        model better understand the audio content
                      </div>
                    </div>
                  </div>

                  <div className="control-group">
                    <label>Transcription Model</label>
                    <div className="model-options">
                      {availableModels.map((model) => (
                        <label key={model} className="model-option">
                          <input
                            type="radio"
                            name="model"
                            value={model}
                            checked={selectedModel === model}
                            onChange={(e) => handleModelChange(e.target.value)}
                          />
                          <div>
                            <span className="model-name">
                              {model.toUpperCase()}
                            </span>
                            <span className="model-description">
                              {model === "tiny" && "Fastest (Lower accuracy)"}
                              {model === "base" && "Basic model (Balanced)"}
                              {model === "small" &&
                                "Small model (Better accuracy)"}
                              {model === "medium" &&
                                "Medium model (High accuracy)"}
                              {model === "large" &&
                                "Large model (Highest accuracy)"}
                              {model === "turbo" &&
                                "Latest optimized model (Recommended)"}
                            </span>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="control-group">
                    <label>
                      Temperature
                      <span className="value-label">
                        {temperature.toFixed(1)}
                      </span>
                    </label>
                    <div className="slider-container">
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.1"
                        value={temperature}
                        style={{
                          "--slider-progress": `${(temperature / 1) * 100}%`,
                        }}
                        onChange={(e) =>
                          setTemperature(parseFloat(e.target.value))
                        }
                      />
                      <div className="slider-description">
                        Adjust generation randomness, higher values produce more
                        variations
                      </div>
                    </div>
                  </div>

                  <div className="control-group">
                    <label>
                      No Speech Threshold
                      <span className="value-label">
                        {noSpeechThreshold.toFixed(1)}
                      </span>
                    </label>
                    <div className="slider-container">
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.1"
                        value={noSpeechThreshold}
                        style={{
                          "--slider-progress": `${
                            (noSpeechThreshold / 1) * 100
                          }%`,
                        }}
                        onChange={(e) =>
                          setNoSpeechThreshold(parseFloat(e.target.value))
                        }
                      />
                      <div className="slider-description">
                        Adjust sensitivity for non-speech detection, higher
                        values filter background noise more strictly
                      </div>
                    </div>
                  </div>

                  <div className="control-group">
                    <label>
                      Silence Threshold
                      <span className="value-label">
                        {hallucinationSilenceThreshold.toFixed(1)}s
                      </span>
                    </label>
                    <div className="slider-container">
                      <input
                        type="range"
                        min="0"
                        max="5"
                        step="0.5"
                        value={hallucinationSilenceThreshold}
                        style={{
                          "--slider-progress": `${
                            (hallucinationSilenceThreshold / 5) * 100
                          }%`,
                        }}
                        onChange={(e) =>
                          setHallucinationSilenceThreshold(
                            parseFloat(e.target.value)
                          )
                        }
                      />
                      <div className="slider-description">
                        Set detection duration for silence, longer values help
                        avoid false detections
                      </div>
                    </div>
                  </div>

                  <div className="control-group">
                    <label>Word-level Timestamps</label>
                    <div className="checkbox-container">
                      <input
                        type="checkbox"
                        checked={wordTimestamps}
                        onChange={(e) => setWordTimestamps(e.target.checked)}
                      />
                      <div>
                        <span className="checkbox-text">
                          Enable word-level timestamps
                        </span>
                        <div className="checkbox-description">
                          Generate precise timestamps for each word to improve
                          audio alignment
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="dialog-footer">
                  <button
                    className="dialog-button"
                    onClick={() => setShowAdvancedDialog(false)}
                  >
                    Done
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
