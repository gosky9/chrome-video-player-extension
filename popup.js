document.addEventListener('DOMContentLoaded', function() {
  const folderSelect = document.querySelector('.select-mini[title="收藏夹选择"]');
  const stopButton = document.querySelector('.control-btn.stop');
  const prevButton = document.querySelector('.control-btn[title="上一个"]');
  const playPauseButton = document.querySelector('.control-btn[title="播放/暂停"]');
  const nextButton = document.querySelector('.control-btn[title="下一个"]');
  const playIcon = playPauseButton.querySelector('i');
  const playModeToggle = document.querySelector('.mode-toggle');
  const progressBar = document.getElementById('progressBar');
  const progress = document.getElementById('progress');
  const videoList = document.querySelector('.video-list');
  const currentTimeEl = document.getElementById('currentTime');
  const totalTimeEl = document.getElementById('totalTime');
  const playbackSpeed = document.querySelector('.select-mini[title="播放速度"]');
  const autoplayCheckbox = document.getElementById('autoplay');
  const fullscreenButton = document.querySelector('.fullscreen-btn');

  let defaultFolderId = null;
  let currentVideoId = null;
  let isPlaying = false;
  let isRandomMode = true; // 默认随机播放模式

  // 更新播放/暂停图标
  function updatePlayPauseIcon(playing) {
    if (playing) {
      playIcon.classList.remove('fa-play');
      playIcon.classList.add('fa-pause');
    } else {
      playIcon.classList.remove('fa-pause');
      playIcon.classList.add('fa-play');
    }
  }

  // 更新播放模式图标
  function updatePlayModeIcon(isRandom) {
    if (isRandom) {
      playModeToggle.querySelector('i').classList.remove('fa-list');
      playModeToggle.querySelector('i').classList.add('fa-random');
      playModeToggle.title = "当前为随机播放，点击切换到顺序播放";
    } else {
      playModeToggle.querySelector('i').classList.remove('fa-random');
      playModeToggle.querySelector('i').classList.add('fa-list');
      playModeToggle.title = "当前为顺序播放，点击切换到随机播放";
    }
  }

  // 加载用户设置
  chrome.storage.sync.get([
    'lastSelectedFolder', 
    'playMode', 
    'autoplay', 
    'playbackSpeed'
  ], function(result) {
    // 设置默认播放模式
    isRandomMode = result.playMode !== 'sequential';
    updatePlayModeIcon(isRandomMode);

    // 设置是否自动播放下一个视频
    if (result.autoplay !== undefined) {
      autoplayCheckbox.checked = result.autoplay;
    }

    // 设置播放速度
    if (result.playbackSpeed) {
      playbackSpeed.value = result.playbackSpeed;
    }
  });

  // 获取收藏夹列表
  chrome.bookmarks.getTree(function(bookmarkTreeNodes) {
    function addBookmarkFolders(nodes, depth = 0) {
      for (let node of nodes) {
        if (node.children) {
          let option = document.createElement('option');
          option.value = node.id;
          option.textContent = '- '.repeat(depth) + node.title;
          folderSelect.appendChild(option);
          if (node.title === "听歌") {
            option.selected = true;
            defaultFolderId = node.id;
          }
          addBookmarkFolders(node.children, depth + 1);
        }
      }
    }
    addBookmarkFolders(bookmarkTreeNodes);

    // 从存储中加载上次选择的收藏夹，如果没有则使用默认的"听歌"文件夹
    chrome.storage.sync.get(['lastSelectedFolder'], function(result) {
      if (result.lastSelectedFolder) {
        folderSelect.value = result.lastSelectedFolder;
        updateVideoList(result.lastSelectedFolder);
      } else if (defaultFolderId) {
        folderSelect.value = defaultFolderId;
        updateVideoList(defaultFolderId);
      }
    });
  });

  // 修改 folderSelect 的事件监听器
  folderSelect.addEventListener('change', function() {
    const selectedFolderId = folderSelect.value;
    if (selectedFolderId) {
      chrome.storage.sync.set({lastSelectedFolder: selectedFolderId});
      updateVideoList(selectedFolderId);
    }
  });

  // 播放模式切换
  playModeToggle.addEventListener('click', function() {
    isRandomMode = !isRandomMode;
    updatePlayModeIcon(isRandomMode);
    chrome.storage.sync.set({playMode: isRandomMode ? 'random' : 'sequential'});
  });

  // 自动播放选项变更时保存
  autoplayCheckbox.addEventListener('change', function() {
    chrome.storage.sync.set({autoplay: autoplayCheckbox.checked});
  });

  // 播放速度变更时保存
  playbackSpeed.addEventListener('change', function() {
    chrome.storage.sync.set({playbackSpeed: playbackSpeed.value});
    
    // 如果当前正在播放，更新播放速度
    chrome.runtime.sendMessage({
      action: 'setPlaybackSpeed',
      speed: parseFloat(playbackSpeed.value)
    });
  });

  function updateVideoList(folderId) {
    chrome.bookmarks.getChildren(folderId, (bookmarks) => {
      videoList.innerHTML = '';
      
      // 获取当前正在播放的视频ID
      chrome.runtime.sendMessage({action: 'getCurrentVideo'}, (response) => {
        const currentVideoId = response ? response.currentVideoId : null;
        isPlaying = response ? response.isPlaying : false;
        updatePlayPauseIcon(isPlaying);
        
        bookmarks.forEach((bookmark) => {
          if (bookmark.url && (bookmark.url.includes('youtube.com') || bookmark.url.includes('bilibili.com'))) {
            const li = document.createElement('li');
            li.textContent = bookmark.title;
            li.dataset.id = bookmark.id;
            li.dataset.url = bookmark.url;
            
            // 如果是当前播放的视频，添加高亮样式
            if (bookmark.id === currentVideoId) {
              li.classList.add('current');
            }
            
            li.addEventListener('click', () => {
              chrome.runtime.sendMessage({
                action: 'startPlayingFrom',
                folderId: folderId,
                bookmarkId: bookmark.id,
                playMode: isRandomMode ? 'random' : 'sequential',
                autoplay: autoplayCheckbox.checked,
                playbackSpeed: parseFloat(playbackSpeed.value)
              });
            });
            videoList.appendChild(li);
          }
        });
      });
    });
  }

  // 停止播放按钮
  stopButton.addEventListener('click', function() {
    chrome.runtime.sendMessage({ action: 'stopPlaying' });
    isPlaying = false;
    updatePlayPauseIcon(isPlaying);
  });

  // 上一首按钮
  prevButton.addEventListener('click', function() {
    chrome.runtime.sendMessage({ action: 'prevTrack' });
  });

  // 下一首按钮
  nextButton.addEventListener('click', function() {
    chrome.runtime.sendMessage({ action: 'nextTrack' });
  });

  // 播放/暂停按钮
  playPauseButton.addEventListener('click', function() {
    if (isPlaying) {
      chrome.runtime.sendMessage({ action: 'pauseVideo' });
      isPlaying = false;
    } else {
      // 如果没有当前播放的视频，从列表中选择第一个开始播放
      if (!currentVideoId && videoList.children.length > 0) {
        const firstVideo = videoList.children[0];
        chrome.runtime.sendMessage({
          action: 'startPlayingFrom',
          folderId: folderSelect.value,
          bookmarkId: firstVideo.dataset.id,
          playMode: isRandomMode ? 'random' : 'sequential',
          autoplay: autoplayCheckbox.checked,
          playbackSpeed: parseFloat(playbackSpeed.value)
        });
      } else {
        chrome.runtime.sendMessage({ action: 'resumeVideo' });
      }
      isPlaying = true;
    }
    updatePlayPauseIcon(isPlaying);
  });

  // 进度条点击跳转
  progressBar.addEventListener('click', function(e) {
    const rect = progressBar.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / rect.width;
    chrome.runtime.sendMessage({
      action: 'seekTo',
      position: pos // 0-1之间的相对位置
    });
  });

  // 格式化时间
  function formatTime(seconds) {
    seconds = Math.floor(seconds);
    const minutes = Math.floor(seconds / 60);
    seconds = seconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  function updateProgress(currentTime, duration) {
    const percentage = (currentTime / duration) * 100;
    progress.style.width = percentage + '%';
    currentTimeEl.textContent = formatTime(currentTime);
    totalTimeEl.textContent = formatTime(duration);
  }

  // 定期从 background.js 获取进度信息
  function updateProgressInfo() {
    chrome.runtime.sendMessage({action: 'getProgress'}, (response) => {
      if (response) {
        if (response.currentTime && response.duration) {
          updateProgress(response.currentTime, response.duration);
        }
        
        // 更新播放状态
        if (response.isPlaying !== undefined && isPlaying !== response.isPlaying) {
          isPlaying = response.isPlaying;
          updatePlayPauseIcon(isPlaying);
        }
        
        // 更新当前播放的视频高亮
        if (response.currentVideoId !== currentVideoId) {
          currentVideoId = response.currentVideoId;
          const items = videoList.querySelectorAll('li');
          items.forEach(item => {
            if (item.dataset.id === currentVideoId) {
              item.classList.add('current');
              // 将当前播放项滚动到可视区域
              item.scrollIntoView({ behavior: 'smooth', block: 'center' });
            } else {
              item.classList.remove('current');
            }
          });
        }
      }
    });
  }
  
  // 使用requestAnimationFrame代替setInterval，性能更好
  let lastUpdateTime = 0;
  function animateProgress(timestamp) {
    if (timestamp - lastUpdateTime >= 1000) { // 每秒更新一次
      updateProgressInfo();
      lastUpdateTime = timestamp;
    }
    requestAnimationFrame(animateProgress);
  }
  
  requestAnimationFrame(animateProgress);

  // 全屏按钮点击事件
  fullscreenButton.addEventListener('click', function() {
    chrome.tabs.create({url: 'player.html'});
  });
});
