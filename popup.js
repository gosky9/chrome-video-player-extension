document.addEventListener('DOMContentLoaded', function() {
  const folderSelect = document.getElementById('folderSelect');
  const playButton = document.getElementById('playButton');
  const stopButton = document.getElementById('stopButton');
  const playMode = document.getElementById('playMode');
  const progressBar = document.getElementById('progressBar');
  const progress = document.getElementById('progress');
  const videoList = document.getElementById('videoList');

  let defaultFolderId = null;

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

  function updateVideoList(folderId) {
    chrome.bookmarks.getChildren(folderId, (bookmarks) => {
      videoList.innerHTML = '';
      bookmarks.forEach((bookmark) => {
        if (bookmark.url && (bookmark.url.includes('youtube.com') || bookmark.url.includes('bilibili.com'))) {
          const li = document.createElement('li');
          li.textContent = bookmark.title;
          li.addEventListener('click', () => {
            chrome.runtime.sendMessage({
              action: 'startPlayingFrom',
              folderId: folderId,
              bookmarkId: bookmark.id,
              playMode: playMode.value
            });
          });
          videoList.appendChild(li);
        }
      });
    });
  }

  // 开始播放
  playButton.addEventListener('click', function() {
    const selectedFolderId = folderSelect.value;
    const selectedPlayMode = playMode.value;
    if (selectedFolderId) {
      // 保存选择的收藏夹
      chrome.storage.sync.set({lastSelectedFolder: selectedFolderId});
      chrome.runtime.sendMessage({
        action: 'startPlaying',
        folderId: selectedFolderId,
        playMode: selectedPlayMode
      });
    } else {
      alert('请选择一个收藏夹');
    }
  });

  // Add event listener for stop button
  stopButton.addEventListener('click', function() {
    chrome.runtime.sendMessage({ action: 'stopPlaying' });
  });

  function updateProgress(currentTime, duration) {
    const percentage = (currentTime / duration) * 100;
    progress.style.width = percentage + '%';
  }

  // 定期从 background.js 获取进度信息
  setInterval(() => {
    chrome.runtime.sendMessage({action: 'getProgress'}, (response) => {
      if (response && response.currentTime && response.duration) {
        updateProgress(response.currentTime, response.duration);
      }
    });
  }, 1000);
});
