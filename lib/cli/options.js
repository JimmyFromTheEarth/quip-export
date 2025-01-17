module.exports =
[
  {
    name: 'help',
    alias: 'h',
    type: Boolean,
    description: 'Display this usage guide.'
  },
  {
    name: 'version',
    alias: 'v',
    type: Boolean,
    description: 'Print version info'
  },
  {
    name: 'token',
    alias: 't',
    type: String,
    description: 'Quip Access Token. To generate a personal access token, visit the page: <https://quip.com/dev/token>',
    typeLabel: '{underline string}'
  },
  {
    name: 'destination',
    alias: 'd',
    type: String,
    description: 'Destination folder for export files',
    typeLabel: '{underline string}'
  },
  {
    name: 'zip',
    alias: 'z',
    type: Boolean,
    description: 'Zip export files'
  },
  {
    name: 'embedded-styles',
    type: Boolean,
    description: 'Embedded in each document stylesheet'
  },
  {
      name: 'embedded-images',
      type: Boolean,
      description: 'Embedded images'
  },
  {
    name: 'docx',
    type: Boolean,
    description: 'Exports documents in *.docx and spreadsheets in *.xlsx format'
  },
  {
    name: 'comments',
    type: Boolean,
    description: 'Includes comments (messages) for the documents'
  },
  {
    name: 'folders',
    type: String,
    description: 'Comma-separated folder\'s IDs to export',
    typeLabel: '{underline string}'
  },
  {
    name: 'debug',
    type: Boolean,
    description: 'Debug mode'
  },
  {
    name: 'only-index',
    type: Boolean,
    description: 'Do not export full documents, just the index of all documents'
  },
  {
    name: 'index-file-name',
    type: String,
    description: 'File name of the index CSV'
  },
  {
    name: 'exclude-regex',
    type: String,
    description: 'Exclude documents whose name or path matches this regex'
  },
  {
    name: 'api-url',
    type: String,
    description: 'Quip API Url. Useful for self/company hosted Quip instances.',
    typeLabel: '{underline string}'
  },
  {
    name: 'rate-limits',
    type: Number,
    description: 'Rate limits per user per minute for the Quip Automation API Calls. Offically basic defaults is 50/minute, 750/hour.'
  }
  ,
  {
    name: 'delay-mode',
    type: Boolean,
    description: 'Execute api calls with delay, make sure only limited requests executed per hour'
  },
  {
    name: 'docx-archive',
    type: Boolean,
    description: 'Exports spreadsheets in *.xlsx and other document types to *.pdf format'
  },
  {
    name: 'docx-archive-init',
    type: Boolean,
    description: 'PDF generation requests only, for --docx-archive'
  }
];
