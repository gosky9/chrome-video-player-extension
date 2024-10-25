let currentPlaylist = [];
let currentIndex = 0;
let isPlaying = false;
let playMode = 'sequential';
let currentTabId = null;
let currentTime = 0;
let duration = 0;
let manuallyClosedTab = false;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'startPlaying') {
    playMode = request.playMode;
    chrome.bookmarks.getChildren(request.folderId, (bookmarks) => {
      currentPlaylist = bookmarks.filter(bookmark => 
        bookmark.url && (bookmark.url.includes('youtube.com') || bookmark.url.includes('bilibili.com'))
      );
      if (currentPlaylist.length > 0) {
        isPlaying = true;
        currentIndex = 0;
        manuallyClosedTab = false;
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
        currentIndex = currentPlaylist.findIndex(bookmark => bookmark.id === request.bookmarkId);
        manuallyClosedTab = false;
        if (playMode === 'random') {
          shufflePlaylist();
          // 确保选中的视频在随机播放列表的第一位
          const selectedBookmark = currentPlaylist.find(bookmark => bookmark.id === request.bookmarkId);
          currentPlaylist = [selectedBookmark, ...currentPlaylist.filter(bookmark => bookmark.id !== request.bookmarkId)];
        }
        playNext();
      }
    });
  } else if (request.action === 'stopPlaying') {
    stopPlaying();
  } else if (request.action === 'getProgress') {
    sendResponse({currentTime: currentTime, duration: duration});
  } else if (request.action === 'updateProgress') {
    currentTime = request.currentTime;
    duration = request.duration;
  } else if (request.action === 'videoEnded') {
    playNext();
  }
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
    const url = currentPlaylist[currentIndex].url;
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

function playAudio(url) {
  if (currentTabId) {
    chrome.tabs.update(currentTabId, { url: url }, (tab) => {
      if (chrome.runtime.lastError) {
        // 如果标签页不存在，创建一个新的
        chrome.tabs.create({ url: url, active: true }, (newTab) => {
          currentTabId = newTab.id;
        });
      }
    });
  } else {
    chrome.tabs.create({ url: url, active: true }, (tab) => {
      currentTabId = tab.id;
    });
  }
}

// 监听标签页关闭事件
chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === currentTabId) {
    currentTabId = null;
    playNext();
  }
});

function stopPlaying() {
  isPlaying = false;
  currentPlaylist = [];
  currentIndex = 0;
  currentTime = 0;
  duration = 0;
  
  if (currentTabId) {
    chrome.tabs.remove(currentTabId, () => {
      currentTabId = null;
    });
  }
}
