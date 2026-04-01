// Popup script - handles UI interactions and multi-page enrichment

const MAX_PRODUCTS = 150;

let scrapedData = null;

document.addEventListener('DOMContentLoaded', function() {
  const scrapeBtn = document.getElementById('scrapeBtn');
  const enrichBtn = document.getElementById('enrichBtn');
  const downloadBtn = document.getElementById('downloadBtn');
  const status = document.getElementById('status');
  const productCount = document.getElementById('productCount');
  const totalUpvotes = document.getElementById('totalUpvotes');
  const detailsCount = document.getElementById('detailsCount');
  const productLimit = document.getElementById('productLimit');
  const preview = document.getElementById('preview');
  const previewList = document.getElementById('previewList');

  productLimit.textContent = String(MAX_PRODUCTS);

  initializePopup().catch((error) => {
    setStatus(`Error: ${error.message}`, 'error');
  });

  scrapeBtn.addEventListener('click', async function() {
    setBusyState({
      scrape: true,
      enrich: true,
      download: true
    });
    setStatus('Extracting products from the current page...', 'default');

    try {
      const tab = await queryActiveTab();
      ensureProductHuntTab(tab);

      const response = await sendMessageToTab(tab.id, { action: 'scrape' });

      if (!response || !response.success) {
        throw new Error(response && response.error ? response.error : 'No products found on this page');
      }

      const products = (response.products || []).slice(0, MAX_PRODUCTS);
      scrapedData = {
        date: new Date().toISOString().split('T')[0],
        scraped_at: new Date().toISOString(),
        total_products: products.length,
        enrichment_limit: MAX_PRODUCTS,
        enriched_products: 0,
        products: products
      };

      renderData();

      setStatus(
        `Scraped ${products.length} product${products.length === 1 ? '' : 's'}. You can now enrich details for the top ${Math.min(products.length, MAX_PRODUCTS)}.`,
        'success'
      );
      setBusyState({
        scrape: false,
        enrich: products.length === 0,
        download: products.length === 0
      });
    } catch (error) {
      setStatus(`Error: ${error.message}`, 'error');
      setBusyState({
        scrape: false,
        enrich: !scrapedData,
        download: !scrapedData
      });
    }
  });

  enrichBtn.addEventListener('click', async function() {
    if (!scrapedData || !scrapedData.products || !scrapedData.products.length) {
      return;
    }

    const productsToEnrich = scrapedData.products.slice(0, MAX_PRODUCTS);
    const activeTab = await queryActiveTab().catch(() => null);
    const windowId = activeTab && typeof activeTab.windowId === 'number'
      ? activeTab.windowId
      : undefined;

    setBusyState({
      scrape: true,
      enrich: true,
      download: true
    });
    setStatus(
      `Keep this popup open. Enriching details for ${productsToEnrich.length} product${productsToEnrich.length === 1 ? '' : 's'}...`,
      'default'
    );

    const enrichedProducts = [...scrapedData.products];
    const failures = [];
    let enrichedCountValue = 0;

    try {
      for (let index = 0; index < productsToEnrich.length; index += 1) {
        const product = productsToEnrich[index];
        setStatus(
          `Enriching ${index + 1}/${productsToEnrich.length}: ${product.name}`,
          'default'
        );

        try {
          const details = await scrapeProductDetailsInTab(product, windowId);
          enrichedProducts[index] = {
            ...product,
            details: details,
            enrichment_status: 'success',
            enriched_at: new Date().toISOString()
          };
          enrichedCountValue += 1;
        } catch (error) {
          enrichedProducts[index] = {
            ...product,
            enrichment_status: 'failed',
            enrichment_error: error.message
          };
          failures.push({
            name: product.name,
            error: error.message
          });
        }

        scrapedData = {
          ...scrapedData,
          products: enrichedProducts,
          enriched_products: enrichedCountValue
        };
        renderData();
        await delay(250);
      }

      scrapedData = {
        ...scrapedData,
        products: enrichedProducts,
        total_products: enrichedProducts.length,
        enriched_products: enrichedCountValue,
        enrichment_attempted: productsToEnrich.length,
        enrichment_failed: failures.length,
        enrichment_completed_at: new Date().toISOString(),
        enrichment_errors: failures
      };

      renderData();
      setStatus(
        `Details added for ${enrichedCountValue}/${productsToEnrich.length} products${failures.length ? `, ${failures.length} failed` : ''}.`,
        failures.length ? 'error' : 'success'
      );
    } catch (error) {
      setStatus(`Error: ${error.message}`, 'error');
    } finally {
      setBusyState({
        scrape: false,
        enrich: !scrapedData || !scrapedData.products || scrapedData.products.length === 0,
        download: !scrapedData || !scrapedData.products || scrapedData.products.length === 0
      });
    }
  });

  downloadBtn.addEventListener('click', function() {
    if (!scrapedData) {
      return;
    }

    const dataStr = JSON.stringify(scrapedData, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const suffix = scrapedData.enriched_products ? '_detailed' : '';
    const filename = `producthunt_${scrapedData.date}${suffix}_${Date.now()}.json`;

    chrome.downloads.download({
      url: url,
      filename: filename,
      saveAs: true
    }, function() {
      setStatus('Download started successfully.', 'success');
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  });

  async function initializePopup() {
    const currentTab = await queryActiveTab();

    if (!currentTab || !currentTab.url || !currentTab.url.includes('producthunt.com')) {
      setStatus('Please navigate to Product Hunt first.', 'error');
      setBusyState({
        scrape: true,
        enrich: true,
        download: true
      });
      return;
    }

    setStatus('Ready to scrape Product Hunt.', 'success');
  }

  function renderData() {
    if (!scrapedData) {
      productCount.textContent = '0';
      totalUpvotes.textContent = '0';
      detailsCount.textContent = '0';
      preview.style.display = 'none';
      previewList.innerHTML = '';
      return;
    }

    productCount.textContent = String(scrapedData.products.length);
    totalUpvotes.textContent = String(scrapedData.products.reduce((sum, product) => {
      return sum + (parseInt(product.upvotes, 10) || 0);
    }, 0));
    detailsCount.textContent = String(scrapedData.enriched_products || 0);

    renderPreview(scrapedData.products);
  }

  function renderPreview(products) {
    if (!products || products.length === 0) {
      preview.style.display = 'none';
      previewList.innerHTML = '';
      return;
    }

    preview.style.display = 'block';
    previewList.innerHTML = products.slice(0, 5).map((product) => {
      const details = product.details || null;
      const topicPreview = details && Array.isArray(details.topics) && details.topics.length
        ? `<div class="meta-line">Topics: ${escapeHtml(details.topics.slice(0, 3).join(', '))}</div>`
        : '';
      const sitePreview = details && details.website_url
        ? `<div class="meta-line">Site: ${escapeHtml(simplifyUrl(details.website_url))}</div>`
        : '';
      const stateBadge = product.enrichment_status === 'failed'
        ? `<span class="badge">detail failed</span>`
        : details
          ? `<span class="badge">details added</span>`
          : '';

      return `
        <div class="preview-item">
          <strong>${product.rank}. ${escapeHtml(product.name)}</strong>
          <br>
          <small>${escapeHtml(product.tagline)}</small>
          <br>
          <span class="badge">▲ ${escapeHtml(product.upvotes)}</span>
          <span class="badge">💬 ${escapeHtml(product.comments)}</span>
          ${stateBadge}
          ${sitePreview}
          ${topicPreview}
        </div>
      `;
    }).join('');

    if (products.length > 5) {
      previewList.innerHTML += `<p class="more">... and ${products.length - 5} more</p>`;
    }
  }

  async function scrapeProductDetailsInTab(product, windowId) {
    const tab = await createBackgroundTab(product.url, windowId);

    try {
      await waitForTabComplete(tab.id);
      return await requestProductDetails(tab.id, product.name);
    } finally {
      await closeTab(tab.id);
    }
  }

  async function requestProductDetails(tabId, expectedName) {
    let lastError = new Error('Unable to collect product details');

    for (let attempt = 0; attempt < 4; attempt += 1) {
      await delay(1200 + (attempt * 400));

      try {
        const response = await sendMessageToTab(tabId, {
          action: 'scrapeDetails',
          expectedName: expectedName
        });

        if (response && response.success && response.details) {
          return response.details;
        }

        lastError = new Error(response && response.error ? response.error : 'Product details are not ready yet');
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError;
  }

  function ensureProductHuntTab(tab) {
    if (!tab || !tab.url || !tab.url.includes('producthunt.com')) {
      throw new Error('Please open a Product Hunt page before scraping');
    }
  }

  function setBusyState(state) {
    scrapeBtn.disabled = Boolean(state.scrape);
    enrichBtn.disabled = Boolean(state.enrich);
    downloadBtn.disabled = Boolean(state.download);

    scrapeBtn.innerHTML = state.scrape
      ? '<span class="btn-icon">⏳</span> Working...'
      : '<span class="btn-icon">📦</span> Scrape Products';

    enrichBtn.innerHTML = state.enrich
      ? '<span class="btn-icon">⏳</span> Enriching...'
      : '<span class="btn-icon">🔎</span> Add More Details';
  }

  function setStatus(message, type) {
    const className = type === 'error'
      ? 'error'
      : type === 'success'
        ? 'success'
        : '';

    status.innerHTML = `<p class="${className}">${className === 'error' ? '❌ ' : className === 'success' ? '✅ ' : '⏳ '}${escapeHtml(message)}</p>`;
  }

  function queryActiveTab() {
    return new Promise((resolve, reject) => {
      chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }

        resolve(tabs[0]);
      });
    });
  }

  function sendMessageToTab(tabId, message) {
    return new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(tabId, message, function(response) {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }

        resolve(response);
      });
    });
  }

  function createBackgroundTab(url, windowId) {
    return new Promise((resolve, reject) => {
      const createProperties = {
        url: url,
        active: false
      };

      if (typeof windowId === 'number') {
        createProperties.windowId = windowId;
      }

      chrome.tabs.create(createProperties, function(tab) {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }

        resolve(tab);
      });
    });
  }

  function waitForTabComplete(tabId, timeoutMs = 45000) {
    return new Promise((resolve, reject) => {
      let settled = false;

      const cleanup = () => {
        if (!settled) {
          settled = true;
          clearTimeout(timeoutId);
          chrome.tabs.onUpdated.removeListener(handleUpdate);
        }
      };

      const handleUpdate = (updatedTabId, changeInfo) => {
        if (updatedTabId !== tabId || changeInfo.status !== 'complete') {
          return;
        }

        cleanup();
        resolve();
      };

      const timeoutId = setTimeout(() => {
        cleanup();
        reject(new Error('Timed out while loading a product page'));
      }, timeoutMs);

      chrome.tabs.onUpdated.addListener(handleUpdate);
      chrome.tabs.get(tabId, function(tab) {
        if (chrome.runtime.lastError) {
          cleanup();
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }

        if (tab && tab.status === 'complete') {
          cleanup();
          resolve();
        }
      });
    });
  }

  function closeTab(tabId) {
    if (typeof tabId !== 'number') {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      chrome.tabs.remove(tabId, function() {
        resolve();
      });
    });
  }

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function simplifyUrl(value) {
    try {
      return new URL(value).hostname.replace(/^www\./, '');
    } catch (error) {
      return value;
    }
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
});
