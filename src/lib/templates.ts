import type { ResumeBuilderConfig } from '../db/schema';

export interface ResumeTemplateSpec {
  id: string;
  name: string;
  category: 'ats' | 'modern' | 'creative' | 'academic' | 'fresher' | 'executive';
  description: string;
  isAtsSafe: boolean;
  defaultAccent: 'teal' | 'indigo' | 'slate' | 'emerald';
  layout: 'single-column' | 'two-column' | 'compact';
}

export const RESUME_TEMPLATE_CATALOG: ResumeTemplateSpec[] = [
  {
    id: 'ats-classic',
    name: 'ATS Classic Single-Column',
    category: 'ats',
    description: 'Standard headings, single column, maximum ATS parser accuracy.',
    isAtsSafe: true,
    defaultAccent: 'teal',
    layout: 'single-column',
  },
  {
    id: 'ats-compact',
    name: 'ATS Dense Engineering',
    category: 'ats',
    description: 'High-density single-column layout built for 1-page technical resumes.',
    isAtsSafe: true,
    defaultAccent: 'slate',
    layout: 'compact',
  },
  {
    id: 'modern-teal',
    name: 'Modern Teal Accent',
    category: 'modern',
    description: 'Crisp hairline dividers with subtle teal visual hierarchy.',
    isAtsSafe: true,
    defaultAccent: 'teal',
    layout: 'single-column',
  },
  {
    id: 'modern-indigo',
    name: 'Modern Indigo Split',
    category: 'modern',
    description: 'Balanced two-column header & sidebar skills layout.',
    isAtsSafe: false,
    defaultAccent: 'indigo',
    layout: 'two-column',
  },
  {
    id: 'executive-serif',
    name: 'Executive Boardroom',
    category: 'executive',
    description: 'Authoritative leadership layout prioritizing scope & metrics.',
    isAtsSafe: true,
    defaultAccent: 'slate',
    layout: 'single-column',
  },
  {
    id: 'executive-slate',
    name: 'Executive Minimalist',
    category: 'executive',
    description: 'Generous margins and clean summary-first hierarchy.',
    isAtsSafe: true,
    defaultAccent: 'indigo',
    layout: 'single-column',
  },
  {
    id: 'fresher-campus',
    name: 'Fresher & Campus Grad',
    category: 'fresher',
    description: 'Leads with education, coursework, and capstone projects.',
    isAtsSafe: true,
    defaultAccent: 'teal',
    layout: 'single-column',
  },
  {
    id: 'fresher-internship',
    name: 'Internship & Projects',
    category: 'fresher',
    description: 'Project-led experience formatting for students and career switchers.',
    isAtsSafe: true,
    defaultAccent: 'indigo',
    layout: 'single-column',
  },
  {
    id: 'academic-cv',
    name: 'Academic & Research CV',
    category: 'academic',
    description: 'Dedicated prominence for publications, awards, and teaching.',
    isAtsSafe: true,
    defaultAccent: 'slate',
    layout: 'single-column',
  },
  {
    id: 'academic-fellow',
    name: 'Lab & Grant CV',
    category: 'academic',
    description: 'Clean multi-page academic timeline for fellowships and PhDs.',
    isAtsSafe: true,
    defaultAccent: 'teal',
    layout: 'single-column',
  },
  {
    id: 'creative-product',
    name: 'Product & Design Lead',
    category: 'creative',
    description: 'Two-column showcase highlighting portfolio links and case studies.',
    isAtsSafe: false,
    defaultAccent: 'teal',
    layout: 'two-column',
  },
  {
    id: 'creative-editorial',
    name: 'Editorial Studio',
    category: 'creative',
    description: 'Clean typographic studio resume for writers, marketers, and PMs.',
    isAtsSafe: false,
    defaultAccent: 'indigo',
    layout: 'two-column',
  },
];

export const DEFAULT_BUILDER_CONFIG: ResumeBuilderConfig = {
  templateId: 'ats-classic',
  font: 'plus-jakarta',
  accentColor: 'teal',
  spacing: 'balanced',
  margin: 'standard',
  atsSafeMode: true,
  showPhoto: false,
  regionFormat: 'US',
  sectionOrder: [
    'summary',
    'skills',
    'experience',
    'projects',
    'education',
    'certifications',
    'languages',
    'awards',
    'volunteering',
    'publications',
  ],
  targetLanguage: 'en',
};

export const SECTION_LABELS: Record<'en' | 'ta' | 'hi', Record<string, string>> = {
  en: {
    summary: 'Professional Summary',
    skills: 'Core Skills',
    experience: 'Work Experience',
    projects: 'Key Projects',
    education: 'Education',
    certifications: 'Certifications',
    languages: 'Languages',
    awards: 'Awards & Honors',
    volunteering: 'Volunteering',
    publications: 'Publications',
  },
  ta: {
    summary: 'தொழில்முறை சுருக்கம்',
    skills: 'முக்கிய திறன்கள்',
    experience: 'பணி அனுபவம்',
    projects: 'திட்டங்கள்',
    education: 'கல்வி',
    certifications: 'சான்றிதழ்கள்',
    languages: 'மொழிகள்',
    awards: 'விருதுகள்',
    volunteering: 'தன்னார்வ சேவை',
    publications: 'வெளியீடுகள்',
  },
  hi: {
    summary: 'व्यावसायिक सारांश',
    skills: 'मुख्य कौशल',
    experience: 'कार्य अनुभव',
    projects: 'प्रमुख प्रोजेक्ट्स',
    education: 'शिक्षा',
    certifications: 'प्रमाणपत्र',
    languages: 'भाषाएं',
    awards: 'पुरस्कार और सम्मान',
    volunteering: 'स्वयंसेवा',
    publications: 'प्रकाशन',
  },
};

export const ACCENT_HEX: Record<ResumeBuilderConfig['accentColor'], [number, number, number]> = {
  teal: [13, 148, 136],
  indigo: [79, 70, 229],
  slate: [51, 65, 85],
  emerald: [5, 150, 105],
};
