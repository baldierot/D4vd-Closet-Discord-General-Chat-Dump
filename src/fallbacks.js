// Render-time repair for dead asset links.
//
// The archive HTML is never rewritten. When an image fails to load we swap in
// something durable that is derivable from data already present in the markup.
//
// Images are classified explicitly by class, because the archive uses a dozen
// of them and they need different treatment. Anything unrecognised is hidden
// rather than labelled - an earlier catch-all branch announced "attachment not
// retrievable" over quoted-user icons, which are not attachments at all.
//
//   avatar-like -> the deterministic default avatar for that user id
//   twemoji     -> the literal unicode character sitting in the alt attribute
//   emoji       -> :name:, the way Discord renders an unavailable custom emoji
//   media       -> a note linking to the message on Discord
//   decorative  -> hidden
//
// Nothing here needs the network or a token.

import { defaultAvatarUrl, messageLink, avatarIdFromImageSrc } from './assets.js';

// Profile pictures. All three carry the user id inside their own src.
const AVATAR_CLASSES = [
    'chatlog__avatar',            // the message author
    'chatlog__reply-avatar',      // the quoted user in a reply
    'chatlog__embed-author-icon', // embed author, proxied
];

// Real user-posted content: worth a note pointing at the original message.
const MEDIA_CLASSES = [
    'chatlog__attachment-media',
    'chatlog__embed-image',
    'chatlog__embed-generic-image',
    'chatlog__embed-generic-gifv',
    'chatlog__embed-generic-video',
];

// Chrome around content. Nothing is lost by dropping these quietly.
const DECORATIVE_CLASSES = [
    'chatlog__embed-footer-icon', // usually a site favicon
    'chatlog__embed-thumbnail',   // link-preview thumbnail
];

const STICKER_CLASS = 'chatlog__sticker--media';

function markHandled(el) {
    el.setAttribute('data-fallback', '1');
}

function alreadyHandled(el) {
    return el.hasAttribute('data-fallback');
}

function hasAny(el, classes) {
    return classes.some((c) => el.classList.contains(c));
}

export function userIdFor(el) {
    const scope = el.closest('.chatlog__message') || el.closest('.chatlog__message-group');
    if (!scope) return null;
    const holder = scope.querySelector('[data-user-id]');
    return holder ? holder.getAttribute('data-user-id') : null;
}

export function messageIdFor(el) {
    const container = el.closest('[data-message-id]');
    return container ? container.getAttribute('data-message-id') : null;
}

function hide(el) {
    markHandled(el);
    el.classList.add('asset-missing');
    return true;
}

function textMarker(el, text, title) {
    markHandled(el);
    const span = el.ownerDocument.createElement('span');
    span.className = 'chatlog__emoji-fallback';
    span.textContent = text;
    if (title) span.title = title;
    el.replaceWith(span);
    return true;
}

function mediaNote(el) {
    const media = el.tagName === 'SOURCE' ? (el.parentElement || el) : el;
    if (alreadyHandled(media)) return false;
    markHandled(media);
    const note = media.ownerDocument.createElement('div');
    note.className = 'asset-unavailable';
    note.textContent = 'attachment not retrievable';
    const link = messageLink(messageIdFor(media));
    if (link) {
        const a = media.ownerDocument.createElement('a');
        a.href = link;
        a.className = 'asset-unavailable-link';
        a.target = '_blank';
        a.rel = 'noreferrer';
        a.textContent = 'view on Discord';
        note.appendChild(media.ownerDocument.createTextNode(' — '));
        note.appendChild(a);
    }
    media.replaceWith(note);
    return true;
}

export function applyAssetFallback(el) {
    if (!el || alreadyHandled(el)) return false;
    const tag = el.tagName;

    if (tag === 'IMG') {
        // Avatars: the id lives in the image's own src, which is the only
        // correct source for a reply avatar (the surrounding message belongs
        // to the replier, not the quoted user).
        if (hasAny(el, AVATAR_CLASSES)) {
            markHandled(el);
            let uid = avatarIdFromImageSrc(el.getAttribute('src'));
            if (!uid && el.classList.contains('chatlog__avatar')) uid = userIdFor(el);
            if (uid) {
                try {
                    el.src = defaultAvatarUrl(uid);
                    return true;
                } catch { /* non-numeric id */ }
            }
            el.classList.add('asset-missing');
            return true;
        }

        // Emoji: twemoji alt holds the actual character, custom emoji alt holds
        // the name.
        if (el.classList.contains('chatlog__emoji')) {
            const alt = el.getAttribute('alt') || el.getAttribute('title') || '';
            const isCustom = (el.getAttribute('src') || '').includes('/emojis/');
            return textMarker(el, isCustom ? (alt ? `:${alt}:` : ':emoji:') : alt,
                el.getAttribute('title') || alt);
        }

        if (el.classList.contains(STICKER_CLASS)) {
            return textMarker(el, ':sticker:', 'sticker unavailable');
        }

        if (hasAny(el, DECORATIVE_CLASSES)) return hide(el);
        if (hasAny(el, MEDIA_CLASSES)) return mediaNote(el);

        // Unknown image class: hide it rather than mislabel it.
        return hide(el);
    }

    // Playable media is always user-posted content.
    if (tag === 'VIDEO' || tag === 'SOURCE' || tag === 'AUDIO') return mediaNote(el);

    return false;
}

// Animated stickers are emitted as an empty <div data-source="....json">, to be
// filled in by lottie. DiscordChatExporter's own bootstrap script did not
// survive the split into day fragments, so nothing ever rendered them: the
// element is a div, so no error event fires and they were blank, silently.
//
// The JSON is served from stickers/ rather than Discord's CDN, which returns it
// without an access-control-allow-origin header (images get one, sticker JSON
// does not) - so a cross-origin fetch is blocked and lottie can never load it.
// fetch-stickers.mjs downloads the 136 the archive references.
export function localStickerPath(src) {
    const m = String(src || '').match(/stickers\/(\d+)\.json/);
    return m ? `stickers/${m[1]}.json` : null;
}

// `lib` is injectable for tests; in the browser it is the global from the
// lottie-web script tag in index.html.
export function initLottieStickers(root, lib) {
    const lottieLib = lib !== undefined ? lib : globalThis.lottie;
    for (const el of root.querySelectorAll('.chatlog__sticker--media[data-source]')) {
        if (el.hasAttribute('data-sticker-init')) continue;
        el.setAttribute('data-sticker-init', '1');

        const local = localStickerPath(el.getAttribute('data-source'));
        if (!local) continue;   // png/gif stickers render as plain images

        if (!lottieLib || typeof lottieLib.loadAnimation !== 'function') {
            stickerFallback(el);
            continue;
        }
        try {
            const anim = lottieLib.loadAnimation({
                container: el,
                renderer: 'svg',
                loop: true,
                autoplay: true,
                path: local,
            });
            if (anim && typeof anim.addEventListener === 'function') {
                anim.addEventListener('data_failed', () => stickerFallback(el));
            }
        } catch {
            stickerFallback(el);
        }
    }
}

function stickerFallback(el) {
    const wrap = el.closest('.chatlog__sticker');
    const name = wrap && wrap.getAttribute('title');
    el.textContent = '';
    const span = el.ownerDocument.createElement('span');
    span.className = 'chatlog__emoji-fallback';
    span.textContent = name ? `:${name}:` : ':sticker:';
    if (name) span.title = name;
    el.appendChild(span);
}

// `error` events from media do not bubble, but they do capture - so one
// listener on the document covers every batch rendered later.
export function installAssetFallbacks(root = document) {
    root.addEventListener('error', (e) => {
        applyAssetFallback(e.target);
    }, true);
}
