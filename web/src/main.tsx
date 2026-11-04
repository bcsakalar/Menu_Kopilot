import '@fontsource-variable/manrope';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AdminApp } from './admin/AdminApp';
import { ChatApp } from './chat/ChatApp';
import './styles.css';

// Two pages behind one bundle: the path is all the routing the site needs.
const isAdmin = window.location.pathname.startsWith('/admin');

createRoot(document.getElementById('root')!).render(<StrictMode>{isAdmin ? <AdminApp /> : <ChatApp />}</StrictMode>);
