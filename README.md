# DOI Fix for Zotero

[![Zotero](https://img.shields.io/badge/Zotero-7%2F8-CC2936)](https://www.zotero.org/)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Automatically retrieve, update, and validate DOIs for Zotero items using the CrossRef API. Compatible with Zotero 7 and Zotero 8.

## Features

- ✅ **Retrieve DOI**: Automatically fetch missing DOIs from CrossRef API based on title, authors, and publication year
- ✅ **Update DOI**: Force update existing DOIs to ensure accuracy (compares old vs new)
- ✅ **Validate DOI**: Verify existing DOIs against CrossRef database
- ✅ **Batch Processing**: Process multiple items at once
- ✅ **Progress Feedback**: Real-time progress window showing success/failure status
- ✅ **Context Menu Integration**: Right-click access from Zotero's item menu
- ✅ **Zotero 7/8 Compatible**: Built using modern bootstrap architecture

## Installation

### Method 1: Download .xpi (Recommended)

1. Download the latest `.xpi` file from [Releases](https://github.com/pandaAIGC/zotero-doi-fix/releases)
2. Open Zotero → Tools → Plugins
3. Click the gear icon → "Install Plugin From File..."
4. Select the downloaded `.xpi` file
5. Restart Zotero

### Method 2: Build from Source

**Requirements**: [7-Zip](https://www.7-zip.org/)

```bash
# Clone the repository
git clone https://github.com/pandaAIGC/zotero-doi-fix.git
cd zotero-doi-fix

# Build the .xpi file (Windows)
build.bat

# Install the generated zotero-doi-fix.xpi file
```

### Method 3: Development Mode

1. Find your Zotero profile's `extensions` directory:
   - Windows: `%APPDATA%\Zotero\Zotero\Profiles\[profile]\extensions\`
   - Mac: `~/Library/Application Support/Zotero/Profiles/[profile]/extensions/`
   - Linux: `~/.zotero/zotero/[profile]/extensions/`

2. Create a file named `doi-fix@zotero.org` (no extension)

3. Inside the file, put the absolute path to this plugin's directory:
   ```
   /path/to/zotero-doi-fix
   ```

4. Restart Zotero

## Usage

### Retrieve DOI

Use this feature to **add missing DOIs** to items that don't have one:

1. Select one or more items in your Zotero library
2. Right-click and select **"Retrieve DOI"**
3. The plugin will search CrossRef and automatically fill in the DOI field
4. Items that already have DOIs will be skipped

### Update DOI

Use this feature to **force update existing DOIs** (useful for correcting incorrect DOIs):

1. Select one or more items in your Zotero library
2. Right-click and select **"Update DOI"**
3. The plugin will retrieve DOIs from CrossRef regardless of existing values
4. Progress window shows: Old DOI → New DOI (or "DOI unchanged" if they match)

### Validate DOI

Use this feature to **verify the validity** of existing DOIs:

1. Select items that already have DOIs
2. Right-click and select **"Validate DOI"**
3. View validation results in the progress window (Valid ✓ / Invalid ✗)

## How It Works

1. **Metadata Collection**: Gathers title, authors, and publication year from selected items
2. **CrossRef Search**: Queries the CrossRef API with collected metadata
3. **Smart Matching**: Uses title similarity matching to find the best result
4. **DOI Update**: Automatically updates the DOI field in Zotero

## API Usage

This plugin uses the [CrossRef REST API](https://www.crossref.org/documentation/retrieve-metadata/rest-api/) to retrieve and validate DOIs. No API key is required for basic usage.

## Compatibility

- **Zotero 7**: ✅ Fully supported
- **Zotero 8**: ✅ Fully supported
- **Zotero 6 and below**: ❌ Not supported (use legacy DOI Manager)

## Development

### Project Structure

```
zotero-doi-fix/
├── manifest.json           # Plugin manifest (WebExtension format)
├── bootstrap.js           # Plugin lifecycle management
├── build.bat             # Build script for Windows
├── icons/                # Plugin icons
│   ├── icon@48.png
│   └── icon@96.png
└── chrome/
    └── content/
        └── doiManager.js  # Core functionality
```

### Building

```bash
# Windows
build.bat

# Manual build (requires 7z or zip)
7z a -tzip zotero-doi-fix.xpi manifest.json bootstrap.js chrome\ icons\
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## Acknowledgments

- Inspired by [zotero-shortdoi](https://github.com/bwiernik/zotero-shortdoi) by Brenton M. Wiernik
- Uses the [CrossRef API](https://www.crossref.org/documentation/retrieve-metadata/rest-api/)
- Built with guidance from the [Zotero Plugin Development Documentation](https://www.zotero.org/support/dev/zotero_7_for_developers)

## License

MIT License - see [LICENSE](LICENSE) file for details

## Support

If you encounter any issues or have suggestions, please [open an issue](https://github.com/pandaAIGC/zotero-doi-fix/issues).

## Changelog

### Version 1.0.0 (2026-02-05)
- Initial release
- Automatic DOI retrieval via CrossRef API
- DOI validation feature
- Batch processing support
- Zotero 7/8 compatibility
