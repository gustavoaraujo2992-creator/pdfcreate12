import pdfParseModule from 'pdf-parse';
import { PDFParse } from 'pdf-parse';

console.log('Default:', typeof pdfParseModule);
if (typeof pdfParseModule === 'function') console.log('Default is func');
if (typeof pdfParseModule === 'object') console.log('Default keys:', Object.keys(pdfParseModule));

console.log('PDFParse named export:', typeof PDFParse);
