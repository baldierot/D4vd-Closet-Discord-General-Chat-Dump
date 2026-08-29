import { describe, it, expect, beforeEach } from 'vitest';
import { applyAssetFallback, userIdFor, messageIdFor, installAssetFallbacks } from '../src/fallbacks.js';
import { defaultAvatarIndex, GUILD_ID, CHANNEL_ID, messageLink } from '../src/assets.js';

const USER = '342852097831862284';

function message({ avatarSrc = 'https://cdn.discordapp.com/avatars/1/dead.png', body = '' } = {}) {
    document.body.innerHTML = `
      <div class="chatlog__message-group">
        <div class="chatlog__message-container" data-message-id="9">
          <div class="chatlog__message">
            <div class="chatlog__message-aside">
              <img class="chatlog__avatar" src="${avatarSrc}">
            </div>
            <div class="chatlog__message-primary">
              <div class="chatlog__header">
                <span class="chatlog__author" title="moji" data-user-id="${USER}">^moji</span>
              </div>
              <div class="chatlog__content">${body}</div>
            </div>
          </div>
        </div>
      </div>`;
    return document.body;
}

describe('userIdFor', () => {
    it('finds the user id from the avatar image', () => {
        message();
        expect(userIdFor(document.querySelector('.chatlog__avatar'))).toBe(USER);
    });

    it('returns null when there is no surrounding message', () => {
        document.body.innerHTML = '<img class="chatlog__avatar">';
        expect(userIdFor(document.querySelector('.chatlog__avatar'))).toBeNull();
    });
});

describe('avatar fallback', () => {
    beforeEach(() => message());

    it('swaps a dead avatar for that user default avatar', () => {
        const img = document.querySelector('.chatlog__avatar');
        expect(applyAssetFallback(img)).toBe(true);
        expect(img.getAttribute('src')).toBe(
            `https://cdn.discordapp.com/embed/avatars/${defaultAvatarIndex(USER)}.png`
        );
    });

    it('is idempotent - a failing fallback does not loop', () => {
        const img = document.querySelector('.chatlog__avatar');
        applyAssetFallback(img);
        const after = img.getAttribute('src');
        expect(applyAssetFallback(img)).toBe(false);
        expect(img.getAttribute('src')).toBe(after);
    });

    it('hides the avatar when no user id is recoverable', () => {
        document.body.innerHTML = '<img class="chatlog__avatar" src="x">';
        const img = document.querySelector('.chatlog__avatar');
        applyAssetFallback(img);
        expect(img.classList.contains('asset-missing')).toBe(true);
    });
});

describe('emoji fallback', () => {
    it('restores the original character for a phantom twemoji', () => {
        // exactly the shape found in days/2023-05-01.html
        message({ body: '<img class="chatlog__emoji " alt="𝑒" title="𝑒" src="https://cdn.jsdelivr.net/gh/twitter/twemoji@latest/assets/svg/1d452.svg">' });
        const img = document.querySelector('.chatlog__emoji');
        applyAssetFallback(img);
        const span = document.querySelector('.chatlog__emoji-fallback');
        expect(span).not.toBeNull();
        expect(span.textContent).toBe('𝑒');
    });

    it('restores a hieroglyph used in aesthetic names', () => {
        message({ body: '<img class="chatlog__emoji " alt="𓆩" title="𓆩" src="https://cdn.jsdelivr.net/gh/twitter/twemoji@latest/assets/svg/131a9.svg">' });
        applyAssetFallback(document.querySelector('.chatlog__emoji'));
        expect(document.querySelector('.chatlog__emoji-fallback').textContent).toBe('𓆩');
    });

    it('renders a dead custom emoji as :name:', () => {
        message({ body: '<img class="chatlog__emoji" alt="monkeyDRIP" title="monkeyDRIP" src="https://cdn.discordapp.com/emojis/802267228011102228.gif">' });
        applyAssetFallback(document.querySelector('.chatlog__emoji'));
        expect(document.querySelector('.chatlog__emoji-fallback').textContent).toBe(':monkeyDRIP:');
    });

    it('keeps the title for hover context', () => {
        message({ body: '<img class="chatlog__emoji" alt="x" title="sob" src="https://cdn.discordapp.com/emojis/1.png">' });
        applyAssetFallback(document.querySelector('.chatlog__emoji'));
        expect(document.querySelector('.chatlog__emoji-fallback').title).toBe('sob');
    });
});

describe('messageLink', () => {
    it('builds a permalink that needs no token and cannot expire', () => {
        expect(messageLink('9')).toBe(`https://discord.com/channels/${GUILD_ID}/${CHANNEL_ID}/9`);
    });

    it('returns null without a message id', () => {
        expect(messageLink(null)).toBeNull();
    });

    it('finds the message id from a nested element', () => {
        message({ body: '<img class="chatlog__attachment-media" src="x">' });
        expect(messageIdFor(document.querySelector('.chatlog__attachment-media'))).toBe('9');
    });
});

describe('attachment fallback', () => {
    it('replaces a dead attachment with a note linking to the Discord message', () => {
        message({ body: '<img class="chatlog__attachment-media" src="https://cdn.discordapp.com/attachments/1/2/x.jpg?ex=1&is=2">' });
        applyAssetFallback(document.querySelector('.chatlog__attachment-media'));
        const note = document.querySelector('.asset-unavailable');
        expect(note).not.toBeNull();
        expect(note.textContent).toContain('not retrievable');
        // must NOT point at the dead cdn url
        const href = note.querySelector('a').getAttribute('href');
        expect(href).not.toContain('cdn.discordapp.com');
        expect(href).toBe(`https://discord.com/channels/${GUILD_ID}/${CHANNEL_ID}/9`);
    });

    it('replaces the video when a source element fails', () => {
        message({ body: '<video class="chatlog__embed-generic-gifv"><source src="https://x/y.mp4"></video>' });
        applyAssetFallback(document.querySelector('source'));
        expect(document.querySelector('.asset-unavailable')).not.toBeNull();
        expect(document.querySelector('video')).toBeNull();
    });
});

describe('installAssetFallbacks', () => {
    it('catches error events from images added after install', () => {
        installAssetFallbacks(document);
        message();
        const img = document.querySelector('.chatlog__avatar');
        img.dispatchEvent(new Event('error'));
        expect(img.getAttribute('src')).toContain('embed/avatars/');
    });
});
