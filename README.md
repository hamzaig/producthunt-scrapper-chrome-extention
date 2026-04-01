# 🚀 Product Hunt Scraper - Chrome Extension

A simple Chrome extension to scrape Product Hunt's daily launches with one click!

## ✨ Features

- ✅ **One-Click Scraping** - No Cloudflare issues!
- ✅ **Export to JSON** - Download data instantly
- ✅ **Live Preview** - See products before downloading
- ✅ **Beautiful UI** - Modern, gradient design
- ✅ **Works on Any Page** - Scrapes directly from the loaded page

## 📦 Installation

### Method 1: Load Unpacked Extension (Developer Mode)

1. **Open Chrome Extensions Page**
   - Go to `chrome://extensions/`
   - OR click Menu (⋮) → Extensions → Manage Extensions

2. **Enable Developer Mode**
   - Toggle the switch in the top right corner

3. **Load Extension**
   - Click "Load unpacked"
   - Select this folder: `producthunt-chrome-extension`

4. **Done!**
   - The extension icon will appear in your toolbar

### Method 2: Pin to Toolbar (Recommended)

1. After loading the extension
2. Click the puzzle piece icon (🧩) in Chrome toolbar
3. Find "Product Hunt Scraper"
4. Click the pin icon (📌)

## 🎯 How to Use

### Step 1: Go to Product Hunt
Navigate to: https://www.producthunt.com/

### Step 2: Open Extension
Click the extension icon (🚀) in your toolbar

### Step 3: Scrape
1. Click **"Scrape Products"** button
2. Wait 1-2 seconds for extraction
3. Review the preview

### Step 4: Download
Click **"Download JSON"** to save the data

## 📊 Output Format

```json
{
  "date": "2026-04-01",
  "total_products": 50,
  "scraped_at": "2026-04-01T12:00:00.000Z",
  "products": [
    {
      "rank": 1,
      "name": "Product Name",
      "tagline": "Product description here",
      "upvotes": "123",
      "comments": "45",
      "url": "https://www.producthunt.com/posts/product-name",
      "scraped_at": "2026-04-01T12:00:00.000Z"
    }
  ]
}
```

## 💡 Tips

### Get More Products
1. Scroll down on Product Hunt page to load more
2. Click "See all of today's products" if available
3. Then click "Scrape Products" in the extension

### Best Results
- Make sure page is fully loaded
- Check that you see the product listings
- The extension works on ANY Product Hunt page

## 🔧 Troubleshooting

### "Please refresh the page"
- Reload the Product Hunt tab
- Click the extension icon again

### "No products found"
- Make sure you're on Product Hunt website
- Check if products are visible on the page
- Try scrolling to load content first

### Extension not appearing
- Check chrome://extensions/
- Make sure it's enabled
- Try reloading the extension

## 📝 File Structure

```
producthunt-chrome-extension/
├── manifest.json       # Extension configuration
├── popup.html         # Extension UI
├── popup.js           # UI logic
├── content.js         # Page scraping logic
├── styles.css         # Styling
├── icon.png          # Extension icon
└── README.md         # This file
```

## 🚀 Why This Works (No Cloudflare Issues)

Unlike automated bots and Playwright:
- ✅ Runs in **real browser** with your session
- ✅ Uses **already-loaded page** content
- ✅ No automation detection
- ✅ Works with your cookies/login
- ✅ 100% reliable

## 🎨 Customization

Want to modify the extension?

**Change Colors:**
Edit `styles.css` - look for color codes like `#667eea`

**Add More Data:**
Edit `content.js` - modify the `scrapeProducts()` function

**Change UI:**
Edit `popup.html` - modify the HTML structure

## 📄 License

Free to use and modify!

## 🤝 Support

Having issues? Common fixes:
1. Refresh Product Hunt page
2. Reload extension
3. Check console for errors (F12)

---

**Made with ❤️ for Product Hunt enthusiasts**

Version 1.0.0
# producthunt-scrapper-chrome-extention
