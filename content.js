chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'playVideo') {
    if (window.location.hostname === 'www.youtube.com') {
      playYouTubeVideo();
    } else if (window.location.hostname === 'www.bilibili.com') {
      playBilibiliVideo();
    }
  } else if (request.action === 'setPlaybackSpeed') {
    setVideoPlaybackSpeed(request.speed);
  } else if (request.action === 'seekTo') {
    seekToPosition(request.position);
  } else if (request.action === 'pauseVideo') {
    pauseVideo();
  } else if (request.action === 'resumeVideo') {
    resumeVideo();
  }
});

// 设置视频播放速度
function setVideoPlaybackSpeed(speed) {
  const video = document.querySelector('video');
  if (video) {
    video.playbackRate = speed;
    console.log(`设置播放速度为: ${speed}x`);
  }
}

// 设置视频播放位置
function seekToPosition(position) {
  const video = document.querySelector('video');
  if (video && !isNaN(position) && position > 0 && position < video.duration) {
    video.currentTime = position;
    console.log(`跳转到: ${position}秒`);
  }
}

// 暂停视频
function pauseVideo() {
  const video = document.querySelector('video');
  if (video && !video.paused) {
    video.pause();
    console.log('视频已暂停');
  }
}

// 恢复播放
function resumeVideo() {
  const video = document.querySelector('video');
  if (video && video.paused) {
    video.play().then(() => {
      console.log('视频已恢复播放');
    }).catch(error => {
      console.error('恢复播放失败:', error);
    });
  }
}

function playYouTubeVideo() {
  const maxRetries = 10;
  let retries = 0;

  function attemptPlay() {
    const video = document.querySelector('video');
    if (video) {
      // 尝试关闭广告或移除遮罩
      clickSkipAdIfPresent();
      
      video.play().then(() => {
        console.log('YouTube video started playing');
        updateProgress(video);
        video.addEventListener('ended', videoEnded);
      }).catch(error => {
        console.error('Error playing YouTube video:', error);
        
        // 检查是否有弹窗或广告遮罩
        tryRemoveOverlays();
        
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

  // 尝试关闭广告
  function clickSkipAdIfPresent() {
    const skipButton = document.querySelector('.ytp-ad-skip-button') || 
                      document.querySelector('.ytp-ad-skip-button-modern');
    if (skipButton) {
      skipButton.click();
      console.log('Clicked skip ad button');
    }
  }
  
  // 尝试移除遮罩层
  function tryRemoveOverlays() {
    const overlays = document.querySelectorAll('.ytp-ad-overlay-container, .ytp-ad-overlay');
    overlays.forEach(overlay => {
      overlay.remove();
      console.log('Removed YouTube overlay');
    });
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
      const overlays = document.querySelectorAll('.bilibili-player-video-overlay, .bpx-player-dialog-wrap');
      overlays.forEach(overlay => overlay.remove());

      // 尝试点击播放按钮
      const playButton = document.querySelector('.bpx-player-ctrl-play') || 
                         document.querySelector('.bilibili-player-video-btn-start');
      if (playButton) {
        playButton.click();
      }
      
      // 尝试关闭广告弹窗
      const closeButtons = document.querySelectorAll('.bpx-player-dm-inside .bpx-player-dm-setting');
      closeButtons.forEach(button => button.click());

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

// 使用throttle函数来限制更新频率，提高性能
function throttle(func, limit) {
  let inThrottle;
  return function() {
    const args = arguments;
    const context = this;
    if (!inThrottle) {
      func.apply(context, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

function updateProgress(video) {
  // 使用throttle限制更新频率为每秒一次
  const throttledUpdate = throttle(() => {
    chrome.runtime.sendMessage({
      action: 'updateProgress',
      currentTime: video.currentTime,
      duration: video.duration
    });
  }, 1000);
  
  video.addEventListener('timeupdate', throttledUpdate);
}

function videoEnded() {
  chrome.runtime.sendMessage({ action: 'videoEnded' });
}

// 检测是否从推荐视频返回到播放列表
function checkIfReturnedFromRecommended() {
  // 如果当前URL是播放列表中的视频URL，且之前暂停了播放列表，则恢复播放
  chrome.runtime.sendMessage({action: 'resumePlaylist'});
}

// 监听页面加载完成事件
window.addEventListener('load', () => {
  if (window.location.hostname === 'www.bilibili.com') {
    playBilibiliVideo();
    // 检查是否是从推荐视频返回
    checkIfReturnedFromRecommended();
  } else if (window.location.hostname === 'www.youtube.com') {
    playYouTubeVideo();
    // 检查是否是从推荐视频返回
    checkIfReturnedFromRecommended();
  }
});
