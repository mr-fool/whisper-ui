from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import whisper
import os
import tempfile
import json
from datetime import timedelta
import requests
import yt_dlp
import re
import torch
import subprocess
import warnings
import traceback

# Initialize Flask app
app = Flask(__name__)
CORS(app)

# Verify CUDA availability
print(f"CUDA available: {torch.cuda.is_available()}")
print(f"CUDA version: {torch.version.cuda}")

# Model configuration
AVAILABLE_MODELS = {
    "tiny": "tiny",
    "base": "base",
    "small": "small",
    "medium": "medium",
    "large-v3": "large-v3"
}

AVAILABLE_LANGUAGES = {
    "auto": "Auto Detection",
    "en": "English",
    "zh": "Chinese",
    "es": "Spanish",
    "fr": "French",
    "de": "German",
    "ja": "Japanese",
    "ko": "Korean",
    "it": "Italian",
    "ru": "Russian"
}

# Core setup
current_model = "medium"
model = None
device = "cuda" if torch.cuda.is_available() else "cpu"

def load_model():
    global model, current_model
    if not model:
        print(f"Loading {current_model} model on {device.upper()}...")
        model = whisper.load_model(current_model, device=device)
    return model

def format_timestamp(seconds):
    """Convert seconds to SRT timestamp format"""
    td = timedelta(seconds=seconds)
    hours = td.seconds // 3600
    minutes = (td.seconds % 3600) // 60
    seconds = td.seconds % 60
    milliseconds = td.microseconds // 1000
    return f"{hours:02d}:{minutes:02d}:{seconds:02d},{milliseconds:03d}"

def generate_srt(segments):
    """Generate SRT formatted subtitles from segments"""
    srt_lines = []
    for i, segment in enumerate(segments, start=1):
        start = format_timestamp(segment['start'])
        end = format_timestamp(segment['end'])
        text = segment['text'].strip()
        
        srt_lines.append(f"{i}\n{start} --> {end}\n{text}\n\n")
    return "".join(srt_lines)

# Verify FFmpeg installation
try:
    subprocess.run(["ffmpeg", "-version"], capture_output=True, check=True)
except Exception as e:
    warnings.warn(f"FFmpeg not found: {str(e)}")

# Routes
@app.route('/models', methods=['GET'])
def get_models():
    return jsonify(list(AVAILABLE_MODELS.keys()))

@app.route('/languages', methods=['GET'])
def get_languages():
    return jsonify(AVAILABLE_LANGUAGES)

@app.route('/model', methods=['POST'])
def change_model():
    global current_model
    data = request.get_json()
    new_model = data.get('model')
    
    if new_model not in AVAILABLE_MODELS:
        return jsonify({"error": "Invalid model"}), 400
    
    current_model = new_model
    load_model()
    return jsonify({"success": True, "current_model": current_model})

@app.route('/transcribe', methods=['POST'])
def transcribe_audio():
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400

    try:
        model = load_model()
        temp_dir = tempfile.mkdtemp()
        safe_filename = re.sub(r'[\\/*?:"<>|]', "_", file.filename)
        temp_path = os.path.join(temp_dir, safe_filename)
        
        with open(temp_path, "wb") as f:
            f.write(file.read())

        # Audio validation
        audio = whisper.load_audio(temp_path)
        if len(audio) < 16000:
            raise ValueError("Audio too short (minimum 1 second required)")

        # Transcription parameters
        lang = request.form.get('language', 'auto')
        transcribe_args = {
            'fp16': torch.cuda.is_available(),
            'language': lang if lang != 'auto' else None
        }

        # Russian language optimization
        if lang == 'ru':
            transcribe_args.update({
                'temperature': (0.0, 0.2, 0.4, 0.6),
                'best_of': 5,
                'beam_size': 5
            })

        result = model.transcribe(temp_path, **transcribe_args)

        # Generate SRT
        srt_content = generate_srt(result['segments'])

        # Cleanup
        os.remove(temp_path)
        os.rmdir(temp_dir)
        
        return jsonify({
            'text': result['text'],
            'srt': srt_content,
            'segments': result['segments'],
            'language': result.get('language', 'en')
        })
            
    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/download/srt', methods=['POST'])
def download_srt():
    data = request.get_json()
    srt_content = data.get('srt')
    
    if not srt_content:
        return jsonify({'error': 'No SRT content provided'}), 400
    
    try:
        with tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.srt', encoding='utf-8') as tmp:
            tmp.write(srt_content)
        
        return send_file(
            tmp.name,
            as_attachment=True,
            download_name='transcription.srt',
            mimetype='text/plain'
        )
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/download/full-srt', methods=['POST'])
def download_full_srt():
    data = request.get_json()
    segments = data.get('segments')
    
    if not segments:
        return jsonify({'error': 'No segments data provided'}), 400
    
    try:
        srt_content = generate_srt(segments)
        
        with tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.srt', encoding='utf-8') as tmp:
            tmp.write(srt_content)
        
        return send_file(
            tmp.name,
            as_attachment=True,
            download_name='full_transcription.srt',
            mimetype='text/plain'
        )
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    load_model()
    app.run(host='0.0.0.0', port=5510, debug=True)