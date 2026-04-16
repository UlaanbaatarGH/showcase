import { useState } from 'react';
import HomeView from './HomeView.jsx';
import ShowcaseView from './ShowcaseView.jsx';

export default function App() {
  const [view, setView] = useState('home');
  if (view === 'home') return <HomeView onEnter={() => setView('showcase')} />;
  return <ShowcaseView />;
}
