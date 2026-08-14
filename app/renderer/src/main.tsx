import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import Home from './pages/Home';
import Player from './pages/Player';
import Settings from './pages/Settings';
import './styles.css';

// 同一 bundle 服务两类窗口:主窗口 #/home、#/settings,透明叠加窗 #/player
// hashchange 客户端路由(不整页 reload)
function useRoute() {
  const parse = () => location.hash.startsWith('#/player') ? 'player'
    : location.hash.startsWith('#/settings') ? 'settings' : 'home';
  const [route, setRoute] = useState(parse);
  useEffect(() => {
    const onHash = () => setRoute(parse());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  return route;
}

function Root() {
  const route = useRoute();
  useEffect(() => {
    document.body.classList.remove('home', 'settings', 'player');
    document.body.classList.add(route); // player 路由下 body 透明(叠加窗)
  }, [route]);
  // 视觉模式六态（规范 §5）：data-vmode 驱动环境光背景差异
  useEffect(() => {
    window.aurora.getSettings().then((s) => {
      const m = s?.visualMode || 'cinema';
      document.documentElement.dataset.vmode = m;
    });
  }, []);
  // 主进程驱动路由（播放/停止时切换 home/player）
  useEffect(() => window.aurora.onNavigate((r) => {
    const target = '#/' + (r === 'home' || r === 'settings' || r === 'player' ? r : 'home');
    if (location.hash !== target) location.hash = target;
  }), []);
  return route === 'player' ? <Player /> : route === 'settings' ? <Settings /> : <Home />;
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode><Root /></React.StrictMode>
);
