chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'playVideo') {
    if (window.location.hostname === 'www.youtube.com') {
      playYouTubeVideo();
    } else if (window.location.hostname === 'www.bilibili.com') {
      playBilibiliVideo();
    }
  }
});

function playYouTubeVideo() {
  const maxRetries = 10;
  let retries = 0;

  function attemptPlay() {
    const video = document.querySelector('video');
    if (video) {
      video.play().then(() => {
        console.log('YouTube video started playing');
        updateProgress(video);
        video.addEventListener('ended', videoEnded);
      }).catch(error => {
        console.error('Error playing YouTube video:', error);
        if (retries < maxRetries) {
          retries++;
          setTimeout(attemptPlay, 1000);
        }
      });
    } else {
      console.log('YouTube video element not found, retrying...');
      if (retries < maxRetries) {
        retries++;
        setTimeout(attemptPlay, 1000);
      }
    }
  }

  attemptPlay();
}

function playBilibiliVideo() {
  const maxRetries = 30;
  let retries = 0;

  function attemptPlay() {
    const video = document.querySelector('video');
    if (video) {
      // 尝试移除任何覆盖层或广告
      const overlays = document.querySelectorAll('.bilibili-player-video-overlay');
      overlays.forEach(overlay => overlay.remove());

      // 尝试点击播放按钮
      const playButton = document.querySelector('.bpx-player-ctrl-play') || 
                         document.querySelector('.bilibili-player-video-btn-start');
      if (playButton) {
        playButton.click();
      }

      video.play().then(() => {
        console.log('Bilibili video started playing');
        updateProgress(video);
        
        // 使用 MutationObserver 来监测视频状态变化
        const observer = new MutationObserver((mutations) => {
          mutations.forEach((mutation) => {
            if (mutation.type === 'attributes' && mutation.attributeName === 'src') {
              console.log('Video source changed, possibly ended');
              videoEnded();
              observer.disconnect();
            }
          });
        });

        observer.observe(video, { attributes: true, attributeFilter: ['src'] });

        // 使用 timeupdate 事件来检测视频是否结束
        video.addEventListener('timeupdate', function checkEnded() {
          if (video.currentTime >= video.duration - 0.5) {
            console.log('Bilibili video ended (timeupdate)');
            video.removeEventListener('timeupdate', checkEnded);
            videoEnded();
          }
        });

        // 仍然保留 ended 事件监听，以防万一
        video.addEventListener('ended', () => {
          console.log('Bilibili video ended (ended event)');
          videoEnded();
        });
      }).catch(error => {
        console.error('Error playing Bilibili video:', error);
        if (retries < maxRetries) {
          retries++;
          setTimeout(attemptPlay, 1000);
        }
      });
    } else {
      console.log('Bilibili video element not found, retrying...');
      if (retries < maxRetries) {
        retries++;
        setTimeout(attemptPlay, 1000);
      }
    }
  }

  attemptPlay();
}

function updateProgress(video) {
  setInterval(() => {
    chrome.runtime.sendMessage({
      action: 'updateProgress',
      currentTime: video.currentTime,
      duration: video.duration
    });
  }, 1000);
}

function videoEnded() {
  chrome.runtime.sendMessage({ action: 'videoEnded' });
}

// 监听页面加载完成事件
window.addEventListener('load', () => {
  if (window.location.hostname === 'www.bilibili.com') {
    playBilibiliVideo();
  } else if (window.location.hostname === 'www.youtube.com') {
    playYouTubeVideo();
  }
});
