from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import whisper
import os
import tempfile
import json
from datetime import timedelta

app = Flask(__name__)
CORS(app)

# 載入 Whisper 模型（使用 'base' 模型作為示例）
model = whisper.load_model("turbo")

def format_timestamp(seconds):
    """將秒數轉換為 VTT/SRT 時間戳格式"""
    td = timedelta(seconds=seconds)
    hours = td.seconds // 3600
    minutes = (td.seconds % 3600) // 60
    seconds = td.seconds % 60
    milliseconds = td.microseconds // 1000
    return f"{hours:02d}:{minutes:02d}:{seconds:02d}.{milliseconds:03d}"

def generate_vtt(segments):
    """生成 VTT 格式的字幕"""
    vtt_lines = ["WEBVTT\n"]
    for i, segment in enumerate(segments, 1):
        start = format_timestamp(segment['start'])
        end = format_timestamp(segment['end'])
        vtt_lines.append(f"\n{start} --> {end}")
        vtt_lines.append(segment['text'].strip())
    return "\n".join(vtt_lines)

def generate_srt(segments):
    """生成 SRT 格式的字幕"""
    srt_lines = []
    for i, segment in enumerate(segments, 1):
        start = format_timestamp(segment['start']).replace('.', ',')
        end = format_timestamp(segment['end']).replace('.', ',')
        srt_lines.append(str(i))
        srt_lines.append(f"{start} --> {end}")
        srt_lines.append(segment['text'].strip())
        srt_lines.append("")
    return "\n".join(srt_lines)

def generate_tsv(segments):
    """生成 TSV 格式的轉錄"""
    tsv_lines = ["start\tend\ttext"]
    for segment in segments:
        start = format_timestamp(segment['start'])
        end = format_timestamp(segment['end'])
        text = segment['text'].strip().replace('\t', ' ')
        tsv_lines.append(f"{start}\t{end}\t{text}")
    return "\n".join(tsv_lines)

def get_base_filename(original_filename):
    """從原始檔名獲取基礎檔名（不含副檔名）"""
    return os.path.splitext(original_filename)[0]

@app.route('/transcribe', methods=['POST'])
def transcribe_audio():
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400

    base_filename = get_base_filename(file.filename)

    # 創建臨時文件來保存上傳的音頻
    with tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(file.filename)[1]) as temp_file:
        file.save(temp_file.name)
        # 使用 Whisper 進行轉錄
        result = model.transcribe(
            temp_file.name,
            temperature=0.0,
            verbose=True,
            no_speech_threshold=0.8,  # 提高無語音檢測閾值
            word_timestamps=True,
            hallucination_silence_threshold=2.0  # 設定靜音閾值為2秒,用於檢測和跳過可能的幻聽片段
        )
        
        # 刪除臨時文件
        os.unlink(temp_file.name)
    
        # 準備不同格式的輸出
        formats = {
            'txt': result['text'],
            'json': result,
            'vtt': generate_vtt(result['segments']),
            'srt': generate_srt(result['segments']),
            'tsv': generate_tsv(result['segments'])
        }
        
        return jsonify({
            'text': result['text'],
            'segments': result['segments'],
            'formats': formats,
            'filename': base_filename
        })

@app.route('/download/<format_type>', methods=['POST'])
def download_transcription(format_type):
    if not request.is_json:
        return jsonify({'error': 'Invalid request'}), 400
    
    data = request.get_json()
    content = data.get('content')
    filename = data.get('filename', 'transcription')
    
    if not content:
        return jsonify({'error': 'No content provided'}), 400
    
    # 創建臨時文件
    with tempfile.NamedTemporaryFile(mode='w', delete=False, suffix=f'.{format_type}', encoding='utf-8') as temp_file:
        if format_type == 'json':
            json.dump(content, temp_file, ensure_ascii=False, indent=2)
        else:
            temp_file.write(content)
    
    # 發送文件
    return send_file(
        temp_file.name,
        as_attachment=True,
        download_name=f'{filename}.{format_type}',
        mimetype='text/plain'
    )

if __name__ == '__main__':
    app.run(host='0.0.0.0', debug=True, port=5510) 