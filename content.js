// Content script that runs on Product Hunt pages
// It supports both list scraping and per-product detail scraping.

(function() {
  'use strict';

  const PRODUCT_HUNT_BASE_URL = 'https://www.producthunt.com';
  const PRODUCT_CARD_SELECTOR = '[data-test^="post-item-"]';
  const PRODUCT_NAME_SELECTOR = '[data-test^="post-name-"] a[href]';
  const MAX_PRODUCTS = 150;
  const DETAIL_STOP_WORDS = [
    'Overview',
    'Launches',
    'Reviews',
    'Alternatives',
    'Customers',
    'Built with',
    'Team',
    'Forum',
    'Awards',
    'More',
    'Follow',
    'Add to collection',
    'Share',
    'Company Info',
    'Info',
    'Social',
    'Similar Products',
    'Top Product Categories',
    'Forum Threads'
  ];

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'scrape') {
      handleListScrape(sendResponse);
      return true;
    }

    if (request.action === 'scrapeDetails') {
      handleDetailScrape(request, sendResponse);
      return true;
    }

    return false;
  });

  function handleListScrape(sendResponse) {
    try {
      const products = scrapeProducts().slice(0, MAX_PRODUCTS);
      sendResponse({
        success: products.length > 0,
        limit: MAX_PRODUCTS,
        products: products
      });
    } catch (error) {
      console.error('Error scraping Product Hunt page:', error);
      sendResponse({ success: false, error: error.message });
    }
  }

  function handleDetailScrape(request, sendResponse) {
    try {
      const details = scrapeProductDetails(request.expectedName || '');
      sendResponse({ success: true, details: details });
    } catch (error) {
      console.error('Error scraping Product Hunt details:', error);
      sendResponse({ success: false, error: error.message });
    }
  }

  function scrapeProducts() {
    const products = scrapeCurrentLayout();

    if (products.length > 0) {
      return products;
    }

    return scrapeLegacyLayout();
  }

  function scrapeCurrentLayout() {
    const products = [];
    const seenUrls = new Set();
    const scope = getProductScope();
    const productCards = scope.querySelectorAll(PRODUCT_CARD_SELECTOR);

    productCards.forEach((card, index) => {
      try {
        const product = extractProductFromCard(card, index);

        if (!product || seenUrls.has(product.url)) {
          return;
        }

        seenUrls.add(product.url);
        products.push(product);
      } catch (error) {
        console.error('Error scraping product card:', error);
      }
    });

    return products;
  }

  function extractProductFromCard(card, index) {
    const nameLink = card.querySelector(PRODUCT_NAME_SELECTOR);
    if (!nameLink) {
      return null;
    }

    const rawName = normalizeWhitespace(nameLink.textContent);
    const name = cleanProductName(rawName);
    const url = toAbsoluteUrl(nameLink.getAttribute('href'));

    if (!isLikelyProductName(name) || !url) {
      return null;
    }

    const rankMatch = rawName.match(/^(\d+)\.\s*/);
    const voteButton = card.querySelector('[data-test="vote-button"]');
    const commentButton = findCommentButton(card, voteButton);

    return {
      rank: rankMatch ? parseInt(rankMatch[1], 10) : index + 1,
      name: name,
      tagline: extractCurrentTagline(card),
      upvotes: extractCount(voteButton),
      comments: extractCount(commentButton),
      url: url,
      scraped_at: new Date().toISOString()
    };
  }

  function extractCurrentTagline(card) {
    const nameContainer = card.querySelector('[data-test^="post-name-"]');
    const directSiblingText = normalizeWhitespace(nameContainer && nameContainer.nextElementSibling
      ? nameContainer.nextElementSibling.textContent
      : '');

    if (isLikelyTagline(directSiblingText)) {
      return directSiblingText;
    }

    const fallbackText = Array.from(card.querySelectorAll('.text-secondary'))
      .map((element) => normalizeWhitespace(element.textContent))
      .find(isLikelyTagline);

    return fallbackText || 'N/A';
  }

  function findCommentButton(card, voteButton) {
    const buttons = Array.from(card.querySelectorAll('button'));

    return (
      buttons.find((button) => {
        if (button === voteButton) {
          return false;
        }

        return extractNumericValue(normalizeWhitespace(button.textContent)) !== null;
      }) ||
      buttons.find((button) => button !== voteButton) ||
      null
    );
  }

  function scrapeLegacyLayout() {
    const products = [];
    const seenUrls = new Set();
    const scope = getProductScope();
    const productLinks = scope.querySelectorAll('a[href*="/products/"], a[href*="/posts/"]');

    productLinks.forEach((link, index) => {
      try {
        const rawName = normalizeWhitespace(link.textContent);
        const name = cleanProductName(rawName);
        const url = toAbsoluteUrl(link.getAttribute('href'));

        if (!isLikelyProductName(name) || !url || seenUrls.has(url)) {
          return;
        }

        seenUrls.add(url);

        const container = link.closest('article, section, li, div[class*="post"], div[class*="item"]');
        const voteButton = container ? container.querySelector('[data-test="vote-button"]') : null;
        const commentButton = container ? findCommentButton(container, voteButton) : null;

        products.push({
          rank: index + 1,
          name: name,
          tagline: extractLooseTagline(container, name),
          upvotes: extractCount(voteButton),
          comments: extractCount(commentButton),
          url: url,
          scraped_at: new Date().toISOString()
        });
      } catch (error) {
        console.error('Error scraping legacy product:', error);
      }
    });

    return products;
  }

  function scrapeProductDetails(expectedName) {
    const main = document.querySelector('main') || document.body;
    const mainText = normalizeWhitespace(main.innerText || '');

    if (!mainText) {
      throw new Error('Product page is not ready yet');
    }

    if (/just a moment|enable javascript and cookies to continue/i.test(mainText)) {
      throw new Error('Product Hunt blocked this page. Open the product page once in your browser, then try again.');
    }

    const lines = extractTextLines(main);
    const name = extractDetailName(main, expectedName);
    const tagline = extractDetailTagline(main, name);
    const summary = extractSummaryFromLines(lines, name, tagline);
    const websiteLink = findLinkByText(main, /^Visit website$/i);
    const forumLink = findLinkByText(main, /^p\//i);
    const reviewSummary = extractReviewSummary(lines, main);

    return {
      description: summary.description || extractMetaDescription(),
      website_url: websiteLink ? toAbsoluteUrl(websiteLink.getAttribute('href')) : '',
      followers: extractFirstMatch(mainText, /(\d[\d.,]*\s*[KMB]?)\s+followers\b/i),
      rating: reviewSummary.rating,
      reviews_count: reviewSummary.reviewsCount,
      launches_count: extractSectionCount(lines, main, 'Launches'),
      launched_in: extractFirstMatch(mainText, /Launched in (\d{4})/i),
      topics: summary.topics.length ? summary.topics : extractTopicNames(main),
      forum_url: forumLink ? toAbsoluteUrl(forumLink.getAttribute('href')) : '',
      gallery_images: extractGalleryImages(),
      page_name: name,
      page_tagline: tagline,
      enriched_at: new Date().toISOString()
    };
  }

  function extractDetailName(root, expectedName) {
    const headings = Array.from(root.querySelectorAll('h1'));
    const expected = cleanProductName(expectedName || '').toLowerCase();

    const match = headings.find((heading) => {
      const text = normalizeWhitespace(heading.textContent);
      if (!isValidDetailName(text)) {
        return false;
      }

      if (!expected) {
        return true;
      }

      const normalizedText = text.toLowerCase();
      return normalizedText === expected || normalizedText.includes(expected) || expected.includes(normalizedText);
    });

    if (match) {
      return normalizeWhitespace(match.textContent);
    }

    const fallback = headings
      .map((heading) => normalizeWhitespace(heading.textContent))
      .find(isValidDetailName);

    if (!fallback) {
      throw new Error('Could not find the product title on this page');
    }

    return fallback;
  }

  function extractDetailTagline(root, name) {
    const headingText = Array.from(root.querySelectorAll('h2'))
      .map((heading) => normalizeWhitespace(heading.textContent))
      .find((text) => isLikelyTagline(text) && text !== name);

    return headingText || 'N/A';
  }

  function extractSummaryFromLines(lines, name, tagline) {
    const visitIndex = lines.findIndex((line) => /^Visit website$/i.test(line));
    const startIndex = visitIndex >= 0 ? visitIndex + 1 : 0;
    const topics = [];
    let description = '';

    for (let index = startIndex; index < Math.min(lines.length, startIndex + 18); index += 1) {
      const line = lines[index];

      if (!line || line === '•' || line === name || line === tagline) {
        continue;
      }

      if (isDetailStopLine(line)) {
        if (description || topics.length) {
          break;
        }
        continue;
      }

      if (!description && looksLikeTopicLine(line)) {
        if (!topics.includes(line)) {
          topics.push(line);
        }
        continue;
      }

      if (!description && looksLikeDescriptionLine(line)) {
        description = line;
        continue;
      }

      if (description) {
        break;
      }
    }

    return {
      topics: topics.slice(0, 6),
      description: description
    };
  }

  function extractReviewSummary(lines, root) {
    const topLines = lines.slice(0, 20);
    const ratingLine = topLines.find((line) => /^[0-5](?:\.\d+)?$/.test(line)) || '';
    const reviewLine = topLines.find((line) => /\breviews?\b/i.test(line)) || '';
    const reviewsLink = findLinkByText(root, /^Reviews\b/i);

    return {
      rating: ratingLine || extractFirstMatch(normalizeWhitespace(root.innerText || ''), /([0-5](?:\.\d+)?)\s+Based on/i),
      reviewsCount: extractNumericValue(reviewLine) ||
        extractNumericValue(reviewsLink ? normalizeWhitespace(reviewsLink.textContent) : '') ||
        '0'
    };
  }

  function extractSectionCount(lines, root, sectionName) {
    const sectionPattern = new RegExp(`^${escapeRegExp(sectionName)}\\s+(\\d+)\\b`, 'i');

    for (const line of lines.slice(0, 30)) {
      const match = line.match(sectionPattern);
      if (match) {
        return match[1];
      }
    }

    const sectionLink = findLinkByText(root, new RegExp(`^${escapeRegExp(sectionName)}\\b`, 'i'));
    return extractNumericValue(sectionLink ? normalizeWhitespace(sectionLink.textContent) : '') || '0';
  }

  function extractTopicNames(root) {
    const topicNames = [];
    const topicLinks = Array.from(root.querySelectorAll('a[href*="/topics/"]'));

    topicLinks.forEach((link) => {
      const text = normalizeWhitespace(link.textContent);

      if (!text || topicNames.includes(text)) {
        return;
      }

      topicNames.push(text);
    });

    return topicNames.slice(0, 6);
  }

  function extractGalleryImages() {
    const urls = [];
    const images = Array.from(document.images);

    images.forEach((image) => {
      const altText = normalizeWhitespace(image.getAttribute('alt') || '');
      const source = image.currentSrc || image.src || '';

      if (!/gallery image/i.test(altText) || !source || urls.includes(source)) {
        return;
      }

      urls.push(source);
    });

    return urls.slice(0, 6);
  }

  function extractLooseTagline(container, name) {
    if (!container) {
      return 'N/A';
    }

    const textBlocks = Array.from(container.querySelectorAll('span, p, small'))
      .map((element) => normalizeWhitespace(element.textContent))
      .filter(Boolean);

    const tagline = textBlocks.find((text) => {
      return isLikelyTagline(text) && text !== name && !text.startsWith(name);
    });

    return tagline || 'N/A';
  }

  function getProductScope() {
    return document.querySelector('[data-test="homepage-section-today"]') || document;
  }

  function findLinkByText(root, pattern) {
    return Array.from(root.querySelectorAll('a[href]')).find((link) => {
      return pattern.test(normalizeWhitespace(link.textContent));
    }) || null;
  }

  function extractCount(element) {
    if (!element) {
      return '0';
    }

    const textCandidates = Array.from(element.querySelectorAll('p, span'))
      .map((node) => normalizeWhitespace(node.textContent))
      .filter(Boolean);

    for (const text of textCandidates) {
      const value = extractNumericValue(text);
      if (value !== null) {
        return value;
      }
    }

    return extractNumericValue(normalizeWhitespace(element.textContent)) || '0';
  }

  function extractMetaDescription() {
    const metaDescription = document.querySelector('meta[name="description"]');
    return metaDescription ? normalizeWhitespace(metaDescription.getAttribute('content') || '') : '';
  }

  function extractTextLines(root) {
    return String(root.innerText || '')
      .split('\n')
      .map((line) => normalizeWhitespace(line))
      .filter(Boolean);
  }

  function cleanProductName(name) {
    return normalizeWhitespace(name).replace(/^\d+\.\s*/, '');
  }

  function isLikelyProductName(name) {
    return Boolean(name) && name.length <= 150 && !/^(Promoted|See all|Today)$/i.test(name);
  }

  function isValidDetailName(name) {
    return Boolean(name) &&
      name.length <= 160 &&
      !/^(Product Hunt|Just a moment|Subscribe|Sign in|Best Products)$/i.test(name);
  }

  function isLikelyTagline(text) {
    return Boolean(text) && !/^Promoted$/i.test(text) && !/^\d[\d,]*$/.test(text);
  }

  function looksLikeTopicLine(text) {
    return text.length <= 40 &&
      !/[.!?]/.test(text) &&
      !/\bfollowers\b/i.test(text) &&
      !/^\d/.test(text);
  }

  function looksLikeDescriptionLine(text) {
    return text.length >= 24 &&
      text.length <= 280 &&
      !isDetailStopLine(text) &&
      !looksLikeTopicLine(text);
  }

  function isDetailStopLine(text) {
    return DETAIL_STOP_WORDS.some((word) => {
      return text === word || text.startsWith(`${word} `);
    }) ||
      /\bfollowers\b/i.test(text) ||
      /^Launched in \d{4}$/i.test(text) ||
      /^View \d+ launches$/i.test(text);
  }

  function extractNumericValue(text) {
    const match = String(text || '').match(/\d[\d,]*/);
    return match ? match[0].replace(/,/g, '') : null;
  }

  function extractFirstMatch(text, pattern) {
    const match = String(text || '').match(pattern);
    return match ? normalizeWhitespace(match[1]) : '';
  }

  function normalizeWhitespace(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function toAbsoluteUrl(href) {
    if (!href) {
      return '';
    }

    try {
      return new URL(href, PRODUCT_HUNT_BASE_URL).href;
    } catch (error) {
      console.error('Invalid product URL:', href, error);
      return href;
    }
  }
})();
