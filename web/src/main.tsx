import '@fontsource-variable/manrope';
import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { AdminApp } from './admin/AdminApp';
import { ChatApp } from './chat/ChatApp';
import './styles.css';

// The tools (D-218) load on their own: the assistant's page stays as light as it was.
const ToolsApp = lazy(() => import('./tools/ToolsApp').then((module) => ({ default: module.ToolsApp })));

// Three pages behind one bundle: the path is all the routing the site needs.
const path = window.location.pathname;
const page = path.startsWith('/admin') ? <AdminApp /> : path.startsWith('/araclar') ? <Suspense fallback={null}><ToolsApp /></Suspense> : <ChatApp />;

createRoot(document.getElementById('root')!).render(<StrictMode>{page}</StrictMode>);
