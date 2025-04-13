let currentPlaylist = [];
let currentIndex = 0;
let isPlaying = false;
let playMode = 'random'; // 默认随机播放
let currentTabId = null;
let currentTime = 0;
let duration = 0;
let manuallyClosedTab = false;
let playbackSpeed = 1.0;
let currentVideoId = null;
let videoPositions = {}; // 存储视频播放位置
let pausedPlaylist = null; // 存储被推荐视频中断的播放列表状态
let videoIsPaused = false; // 视频是否暂停状态

// 加载保存的视频播放位置
chrome.storage.local.get(['videoPositions'], (result) => {
  if (result.videoPositions) {
    videoPositions = result.videoPositions;
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'startPlaying') {
    playMode = request.playMode;
    
    chrome.bookmarks.getChildren(request.folderId, (bookmarks) => {
      currentPlaylist = bookmarks.filter(bookmark => 
        bookmark.url && (bookmark.url.includes('youtube.com') || bookmark.url.includes('bilibili.com'))
      );
      if (currentPlaylist.length > 0) {
        isPlaying = true;
        videoIsPaused = false;
        currentIndex = 0;
        manuallyClosedTab = false;
        pausedPlaylist = null; // 清除之前可能中断的播放列表
        
        if (playMode === 'random') {
          shufflePlaylist();
        }
        playNext();
      }
    });
  } else if (request.action === 'startPlayingFrom') {
    playMode = request.playMode;
    
    chrome.bookmarks.getChildren(request.folderId, (bookmarks) => {
      currentPlaylist = bookmarks.filter(bookmark => 
        bookmark.url && (bookmark.url.includes('youtube.com') || bookmark.url.includes('bilibili.com'))
      );
      if (currentPlaylist.length > 0) {
        isPlaying = true;
        videoIsPaused = false;
        currentIndex = currentPlaylist.findIndex(bookmark => bookmark.id === request.bookmarkId);
        manuallyClosedTab = false;
        pausedPlaylist = null; // 清除之前可能中断的播放列表
        
        if (playMode === 'random') {
          shufflePlaylist();
          // 确保选中的视频在随机播放列表的第一位
          const selectedBookmark = currentPlaylist.find(bookmark => bookmark.id === request.bookmarkId);
          if (selectedBookmark) {
            currentPlaylist = [selectedBookmark, ...currentPlaylist.filter(bookmark => bookmark.id !== request.bookmarkId)];
            currentIndex = 0;
          }
        }
        playNext();
      }
    });
  } else if (request.action === 'stopPlaying') {
    stopPlaying();
  } else if (request.action === 'getProgress') {
    sendResponse({
      currentTime: currentTime, 
      duration: duration,
      currentVideoId: currentVideoId,
      isPlaying: isPlaying && !videoIsPaused
    });
  } else if (request.action === 'updateProgress') {
    currentTime = request.currentTime;
    duration = request.duration;
    
    // 保存视频播放位置
    if (currentVideoId) {
      videoPositions[currentVideoId] = currentTime;
      // 降低保存频率，防止频繁写入存储
      if (Math.random() < 0.1) { // 10%的概率保存
        chrome.storage.local.set({videoPositions: videoPositions});
      }
    }
  } else if (request.action === 'videoEnded') {
    // 视频结束后总是自动播放下一个
    playNext();
  } else if (request.action === 'getCurrentVideo') {
    sendResponse({
      currentVideoId: currentVideoId,
      isPlaying: isPlaying && !videoIsPaused
    });
  } else if (request.action === 'getCurrentVideoURL') {
    // 获取当前播放视频的URL
    if (currentVideoId && currentPlaylist.length > 0) {
      const video = currentPlaylist.find(item => item.id === currentVideoId);
      if (video) {
        sendResponse({ url: video.url });
      } else {
        sendResponse({ url: null });
      }
    } else {
      sendResponse({ url: null });
    }
  } else if (request.action === 'setPlaybackSpeed') {
    playbackSpeed = request.speed;
    // 如果当前正在播放视频，更新播放速度
    if (currentTabId) {
      chrome.tabs.sendMessage(currentTabId, {
        action: 'setPlaybackSpeed',
        speed: playbackSpeed
      });
    }
  } else if (request.action === 'pausePlaylist') {
    // 保存当前播放列表状态，用于稍后恢复
    pausedPlaylist = {
      playlist: [...currentPlaylist],
      index: currentIndex,
      playMode: playMode,
      speed: playbackSpeed
    };
    // 不完全停止播放，只记录状态
    isPlaying = false;
  } else if (request.action === 'resumePlaylist') {
    // 从之前保存的状态恢复播放
    if (pausedPlaylist) {
      currentPlaylist = pausedPlaylist.playlist;
      currentIndex = pausedPlaylist.index;
      playMode = pausedPlaylist.playMode;
      playbackSpeed = pausedPlaylist.speed;
      isPlaying = true;
      videoIsPaused = false;
      manuallyClosedTab = false;
      playNext();
    }
  } else if (request.action === 'prevTrack') {
    playPrevious();
  } else if (request.action === 'nextTrack') {
    if (currentIndex > 0) {
      // 已经开始播放，currentIndex已经加1了，所以这里不用减1
      playTrackAtIndex(currentIndex);
    } else if (currentPlaylist.length > 0) {
      // 第一次播放或者循环到开头了
      playTrackAtIndex(0);
    }
  } else if (request.action === 'pauseVideo') {
    if (currentTabId) {
      videoIsPaused = true;
      chrome.tabs.sendMessage(currentTabId, { action: 'pauseVideo' });
    }
  } else if (request.action === 'resumeVideo') {
    if (currentTabId) {
      videoIsPaused = false;
      chrome.tabs.sendMessage(currentTabId, { action: 'resumeVideo' });
    }
  } else if (request.action === 'seekTo') {
    if (currentTabId && duration > 0) {
      const targetPosition = request.position * duration; // 转换成绝对时间
      chrome.tabs.sendMessage(currentTabId, { 
        action: 'seekTo',
        position: targetPosition
      });
    }
  }
  
  return true; // 保持消息通道开放以支持异步响应
});

function shufflePlaylist() {
  for (let i = currentPlaylist.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [currentPlaylist[i], currentPlaylist[j]] = [currentPlaylist[j], currentPlaylist[i]];
  }
}

function playNext() {
  if (manuallyClosedTab) {
    return;
  }

  if (currentIndex < currentPlaylist.length) {
    const bookmark = currentPlaylist[currentIndex];
    currentVideoId = bookmark.id;
    const url = bookmark.url;
    
    // 开始播放视频
    playAudio(url);
    currentIndex++;
  } else if (isPlaying) {
    currentIndex = 0;
    if (playMode === 'random') {
      shufflePlaylist();
    }
    playNext();
  }
}

function playPrevious() {
  if (currentPlaylist.length === 0) return;
  
  // 回退两个索引（因为currentIndex已经自增了）
  let prevIndex = currentIndex - 2;
  
  // 如果是第一首歌，则回到最后一首
  if (prevIndex < 0) {
    if (playMode === 'random') {
      // 随机模式下，重新洗牌
      shufflePlaylist();
    }
    prevIndex = currentPlaylist.length - 1;
  }
  
  playTrackAtIndex(prevIndex);
}

function playTrackAtIndex(index) {
  if (index >= 0 && index < currentPlaylist.length) {
    const bookmark = currentPlaylist[index];
    currentVideoId = bookmark.id;
    const url = bookmark.url;
    
    // 播放指定索引的视频
    playAudio(url);
    currentIndex = index + 1; // 更新当前索引
  }
}

function playAudio(url) {
  if (currentTabId) {
    chrome.tabs.update(currentTabId, { url: url }, (tab) => {
      if (chrome.runtime.lastError) {
        // 如果标签页不存在，创建一个新的
        chrome.tabs.create({ url: url, active: true }, (newTab) => {
          currentTabId = newTab.id;
          configureNewTab(newTab.id, url);
        });
      } else {
        configureNewTab(tab.id, url);
      }
    });
  } else {
    chrome.tabs.create({ url: url, active: true }, (tab) => {
      currentTabId = tab.id;
      configureNewTab(tab.id, url);
    });
  }
}

function configureNewTab(tabId, url) {
  // 等待页面加载完成后设置播放速度和恢复播放位置
  chrome.tabs.onUpdated.addListener(function onTabLoaded(updatedTabId, changeInfo) {
    if (updatedTabId === tabId && changeInfo.status === 'complete') {
      chrome.tabs.onUpdated.removeListener(onTabLoaded);
      
      setTimeout(() => {
        // 设置播放速度
        chrome.tabs.sendMessage(tabId, {
          action: 'setPlaybackSpeed',
          speed: playbackSpeed
        });
        
        // 恢复播放位置
        if (currentVideoId && videoPositions[currentVideoId]) {
          const savedPosition = videoPositions[currentVideoId];
          chrome.tabs.sendMessage(tabId, {
            action: 'seekTo',
            position: savedPosition
          });
        }
        
        // 检查是否需要暂停视频
        if (videoIsPaused) {
          chrome.tabs.sendMessage(tabId, { action: 'pauseVideo' });
        }
      }, 1500); // 给页面足够时间加载视频元素
    }
  });
}

// 监听标签页关闭事件
chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === currentTabId) {
    currentTabId = null;
    
    // 如果有暂停的播放列表，不要自动播放下一个
    if (!pausedPlaylist) {
      playNext();
    }
  }
});

// 监听标签页导航事件
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (tabId === currentTabId && changeInfo.url) {
    const newUrl = changeInfo.url;
    
    // 检查是否是从当前视频导航到推荐视频
    if (isVideoUrl(newUrl) && currentPlaylist.length > 0 && isPlaying) {
      // 判断用户是否点击了推荐视频
      const isRecommendedVideo = !currentPlaylist.some(bookmark => bookmark.url === newUrl);
      
      if (isRecommendedVideo) {
        // 用户点击了推荐视频，暂停当前播放列表
        chrome.runtime.sendMessage({action: 'pausePlaylist'});
      }
    }
  }
});

// 判断URL是否是视频链接
function isVideoUrl(url) {
  return url.includes('youtube.com/watch') || 
         url.includes('bilibili.com/video') || 
         url.includes('bilibili.com/bangumi');
}

function stopPlaying() {
  isPlaying = false;
  videoIsPaused = false;
  currentPlaylist = [];
  currentIndex = 0;
  currentTime = 0;
  duration = 0;
  pausedPlaylist = null;
  
  // 存储视频播放位置
  chrome.storage.local.set({videoPositions: videoPositions});
  
  if (currentTabId) {
    chrome.tabs.remove(currentTabId, () => {
      currentTabId = null;
    });
  }
}

// 定期保存视频播放位置
setInterval(() => {
  if (Object.keys(videoPositions).length > 0) {
    chrome.storage.local.set({videoPositions: videoPositions});
  }
}, 30000); // 每30秒保存一次
