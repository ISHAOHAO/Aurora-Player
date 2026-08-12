import React from 'react';
import { createRoot } from 'react-dom/client';
import Home from './pages/Home';
import Player from './pages/Player';
import './styles.css';

// 同一 bundle 服务两类窗口:主窗口 #/home,透明叠加窗 #/player
const route = location.hash.startsWith('#/player') ? 'player' : 'home';
document.body.classList.add(route); // player 路由下 body 透明(叠加窗)

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>{route === 'player' ? <Player /> : <Home />}</React.StrictMode>
);
