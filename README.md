# Plugin Template

This is a template for creating plugins for [Obsidian](https://obsidian.md), maintained by [wenlzhang](https://github.com/wenlzhang).

## Getting started

1. Clone this repository to your local machine
2. Update the following files with your plugin information:
   - `manifest.json`:
     - `id`: Your plugin ID (in kebab-case)
     - `name`: Your plugin name
     - `author`: Your name
     - `authorUrl`: Your website or GitHub profile URL
     - `fundingUrl`: Optional funding information
   - `package.json`:
     - `name`: Your plugin name (should match manifest.json)
     - `description`: Your plugin description
     - `author`: Your name
     - `keywords`: Relevant keywords for your plugin

## Development

1. Install dependencies:
```bash
npm install
```

2. Start development server:
```bash
npm run dev
```

3. Build the plugin:
```bash
npm run build
```

## Testing your plugin

1. Create a test vault in Obsidian
2. Create a `.obsidian/plugins` folder in your test vault
3. Copy your plugin folder into the plugins folder
4. Reload Obsidian to load the plugin (Ctrl/Cmd + R)
5. Enable the plugin in Obsidian's settings

## Publishing your plugin

1. Update `versions.json` with your plugin's version history
2. Test your plugin thoroughly
3. Create a GitHub release
4. Submit your plugin to the Obsidian Plugin Gallery

## Support me

<a href='https://ko-fi.com/C0C66C1TB' target='_blank'><img height='36' style='border:0px;height:36px;' src='https://storage.ko-fi.com/cdn/kofi1.png?v=3' border='0' alt='Buy Me a Coffee at ko-fi.com' /></a>
