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
  const fileInputRef = useRef(null);
  const audioRef = useRef(null);
  const segmentRefs = useRef([]);
  const segmentsListRef = useRef(null);
  const [audioUrl, setAudioUrl] = useState(null);

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

      if (response.data && response.data.segments) {
        setTranscription(response.data.text || "");
        setSegments(response.data.segments || []);
        setFormats(response.data.formats || null);
        setFilename(response.data.filename || "transcription");
      } else {
        throw new Error("Invalid response format");
      }
    } catch (err) {
      const errorMessage = err.response?.data?.error || err.message;
      setError(`Transcription failed: ${errorMessage}`);
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

          {segments.length > 0 && (
            <div className="results-section">
              <div className="transcription-container">
                <div className="transcription-header">
                  <h2>Transcription Results</h2>
                  <span className="transcription-time">
                    Processing Time: {transcriptionTime.toFixed(1)}s
                  </span>
                </div>

                <div className="media-player-wrapper">
                  {file?.type.startsWith("video/") ? (
                    <video ref={audioRef} controls className="video-player">
                      <source src={audioUrl} type={file?.type} />
                      Your browser does not support the video element.
                    </video>
                  ) : (
                    <audio ref={audioRef} controls className="audio-player">
                      <source src={audioUrl} type={file?.type} />
                      Your browser does not support the audio element.
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
                      title="點擊播放此段落"
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
        </main>
      </div>
    </div>
  );
}

export default App;
