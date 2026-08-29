// Render-time repair for dead asset links.
//
// The archive HTML is never rewritten. When an image fails to load we swap in
// something durable that is derivable from data already present in the markup:
//
//   avatar  -> the deterministic default avatar for that user id
//   twemoji -> the literal unicode character sitting in the alt attribute
//   emoji   -> :name:, the way Discord renders an unavailable custom emoji
//   media   -> an inline note, so a dead attachment is legible rather than a
//              broken-image glyph
//
// Nothing here needs the network or a token.

import { defaultAvatarUrl } from './assets.js';

function markHandled(el) {
    el.setAttribute('data-fallback', '1');
}

function alreadyHandled(el) {
    return el.hasAttribute('data-fallback');
}

export function userIdFor(el) {
    const scope = el.closest('.chatlog__message') || el.closest('.chatlog__message-group');
    if (!scope) return null;
    const holder = scope.querySelector('[data-user-id]');
    return holder ? holder.getAttribute('data-user-id') : null;
}

export function applyAssetFallback(el) {
    if (!el || alreadyHandled(el)) return false;
    const tag = el.tagName;
    const cls = el.classList;

    // Avatars: fall back to the permanent default avatar derived from the id.
    if (tag === 'IMG' && cls.contains('chatlog__avatar')) {
        markHandled(el);
        const uid = userIdFor(el);
        if (uid) {
            try {
                el.src = defaultAvatarUrl(uid);
                return true;
            } catch {
                // non-numeric id; fall through to hiding it
            }
        }
        cls.add('asset-missing');
        return true;
    }

    // Emoji: replace the image with text. Twemoji alt holds the actual unicode
    // character; custom emoji alt holds the name, which we render as :name:.
    if (tag === 'IMG' && cls.contains('chatlog__emoji')) {
        markHandled(el);
        const alt = el.getAttribute('alt') || el.getAttribute('title') || '';
        const src = el.getAttribute('src') || '';
        const isCustom = src.includes('/emojis/');
        const span = el.ownerDocument.createElement('span');
        span.className = 'chatlog__emoji-fallback';
        span.textContent = isCustom ? (alt ? `:${alt}:` : ':emoji:') : alt;
        const title = el.getAttribute('title') || alt;
        if (title) span.title = title;
        el.replaceWith(span);
        return true;
    }

    // Attachments and embedded media: leave a readable note plus the raw link,
    // rather than a broken-image icon.
    if (tag === 'IMG' || tag === 'VIDEO' || tag === 'SOURCE') {
        const media = tag === 'SOURCE' ? (el.parentElement || el) : el;
        if (alreadyHandled(media)) return false;
        markHandled(media);
        const url = el.getAttribute('src') || '';
        const note = media.ownerDocument.createElement('div');
        note.className = 'asset-unavailable';
        note.textContent = 'attachment no longer available';
        if (url) {
            const a = media.ownerDocument.createElement('a');
            a.href = url;
            a.className = 'asset-unavailable-link';
            a.rel = 'noreferrer';
            a.textContent = 'original link';
            note.appendChild(media.ownerDocument.createTextNode(' — '));
            note.appendChild(a);
        }
        media.replaceWith(note);
        return true;
    }

    return false;
}

// `error` events from media do not bubble, but they do capture - so one
// listener on the document covers every batch rendered later.
export function installAssetFallbacks(root = document) {
    root.addEventListener('error', (e) => {
        applyAssetFallback(e.target);
    }, true);
}
