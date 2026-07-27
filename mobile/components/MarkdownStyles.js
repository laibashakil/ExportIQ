// Style object used by every <Markdown /> instance in the app so document
// bodies (buyer emails, CSDDD forms, checklists) render with the same
// typography. Shape matches the keys understood by
// `react-native-markdown-display`.
import { colors, radii } from '../constants/colors';

export const markdownStyles = {
  body:        { color: '#C9D1D9', fontSize: 15, lineHeight: 24 },
  heading1:    { color: '#FFFFFF', fontSize: 20, fontWeight: 'bold', marginBottom: 10, marginTop: 6 },
  heading2:    { color: '#FFFFFF', fontSize: 17, fontWeight: '700', marginBottom: 8, marginTop: 12 },
  heading3:    { color: '#FFFFFF', fontSize: 15, fontWeight: '700', marginBottom: 6, marginTop: 8 },
  paragraph:   { color: '#C9D1D9', fontSize: 15, lineHeight: 24, marginBottom: 10 },
  strong:      { color: '#FFFFFF', fontWeight: 'bold' },
  em:          { fontStyle: 'italic' },
  link:        { color: '#00D4AA' },
  blockquote:  {
    backgroundColor: colors.surfaceAlt,
    borderLeftColor: colors.primary,
    borderLeftWidth: 3,
    padding: 8,
    marginVertical: 6,
  },
  hr:          { backgroundColor: '#21262D', height: 1, marginVertical: 12 },

  // Tables — markdown-display nests cells under `table > tr > th/td`
  table:       { borderWidth: 1, borderColor: '#21262D', marginVertical: 8, borderRadius: radii.sm },
  thead:       { backgroundColor: '#21262D' },
  th:          { padding: 8, color: '#00D4AA', fontWeight: 'bold' },
  tr:          { borderBottomWidth: 1, borderColor: '#21262D', flexDirection: 'row' },
  td:          { padding: 8, color: '#E6EDF3', flex: 1 },

  // Aliases the user spec sent; keep them in case the library version reads them
  tableHeader: { backgroundColor: '#21262D', padding: 8, color: '#00D4AA', fontWeight: 'bold' },
  tableRow:    { borderBottomWidth: 1, borderColor: '#21262D' },
  tableCell:   { padding: 8, color: '#E6EDF3' },

  // Lists
  bullet_list:  { marginLeft: 8, marginBottom: 8 },
  ordered_list: { marginLeft: 8, marginBottom: 8 },
  list_item:    { color: '#C9D1D9', marginBottom: 6, flexDirection: 'row' },
  bullet_list_icon: { color: '#00D4AA', marginRight: 8 },
  ordered_list_icon: { color: '#00D4AA', marginRight: 8, fontWeight: '700' },

  // Code
  code_inline: {
    backgroundColor: '#161B22',
    color: '#00D4AA',
    paddingHorizontal: 4,
    borderRadius: 4,
    fontFamily: 'monospace',
  },
  code_block:  {
    backgroundColor: '#161B22',
    padding: 12,
    borderRadius: 8,
    color: '#00D4AA',
    fontFamily: 'monospace',
    fontSize: 12,
  },
  fence:       {
    backgroundColor: '#161B22',
    padding: 12,
    borderRadius: 8,
    color: '#00D4AA',
    fontFamily: 'monospace',
    fontSize: 12,
  },
};
