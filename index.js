const video = document.querySelector('video');
const captions = document.getElementById('captions');
let socket;
let recorder;
captions.style.display = 'none';

const captureCamera = (callback) => {
  navigator.mediaDevices.getUserMedia({ audio: true, video: true })
    .then(camera => callback(camera))
    .catch(error => {
      alert('Unable to capture your camera. Please check console logs.');
      console.error(error);
    }
  );
}

const stopRecordingCallback = () => {
  socket.send(JSON.stringify({terminate_session: true}));
  socket.close();
  socket = null;

  recorder.camera.stop();
  recorder.destroy();
  recorder = null;
}

document.getElementById('btn-start-recording').onclick = async function () {
  this.disabled = true;

  const response = await fetch('http://localhost:8000'); 
  const data = await response.json();

  if(data.error){
    alert(data.error)
  }

  const { token } = data;

  socket = await new WebSocket(`wss://api.assemblyai.com/v2/realtime/ws?sample_rate=16000&token=${token}`);

  const texts = {};

  socket.onmessage = (message) => {
    let msg = '';
    const res = JSON.parse(message.data);
    console.log(res)
    texts[res.audio_start] = res.text;
    const keys = Object.keys(texts);
    keys.sort((a, b) => a - b);
    for (const key of keys) {
      if (texts[key]) {
        msg += ` ${texts[key]}`;
      }
    }
    captions.innerText = msg;
  };

  socket.onerror = (event) => {
    console.error(event);
    socket.close();
  }
  
  socket.onclose = event => {
    console.log(event);
    socket = null;
  }

  socket.onopen = () => {
    captureCamera(function(camera) {
        video.controls = false
        video.muted = true;
        video.volume = 0;
        video.srcObject = camera;

        captions.style.display = '';

        recorder = new RecordRTC(camera, {
            type: 'audio',
            mimeType: 'audio/;codecs=pcm', // endpoint requires 16bit PCM audio
            recorderType: StereoAudioRecorder,
            timeSlice: 300, // set 250 ms intervals of data that sends to AAI
            desiredSampRate: 16000,
            numberOfAudioChannels: 1, // real-time requires only one channel
            bufferSize: 4096,
            audioBitsPerSecond: 128000,
            ondataavailable: (blob) => {
              const reader = new FileReader();
              reader.onload = () => {
                const base64data = reader.result;

                // audio data must be sent as a base64 encoded string
                if (socket) {
                  socket.send(JSON.stringify({ audio_data: base64data.split('base64,')[1] }));
                }
              };
              reader.readAsDataURL(blob);
            },
        });

        recorder.startRecording();

        // release camera on stopRecording
        recorder.camera = camera;

        document.getElementById('btn-stop-recording').disabled = false;
    });
  }
};

document.getElementById('btn-stop-recording').onclick = function() {
  this.disabled = true;
  recorder.stopRecording(stopRecordingCallback);
  document.getElementById('btn-start-recording').disabled = false;
};