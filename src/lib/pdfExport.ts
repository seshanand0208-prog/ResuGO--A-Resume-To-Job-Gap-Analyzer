import { jsPDF } from 'jspdf';
import type { GapReportData } from '../db/schema';

export function exportReportToPdf(input: {
  jobTitle: string;
  company: string;
  location?: string | null;
  overallScore: number;
  skillsScore: number;
  experienceScore: number;
  educationScore: number;
  keywordsScore: number;
  gapReport: GapReportData;
}) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 44;
  const maxWidth = pageWidth - margin * 2;
  let y = 52;

  const ensureSpace = (needed = 40) => {
    if (y + needed > 780) {
      doc.addPage();
      y = 52;
    }
  };

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(13, 148, 136);
  doc.text('ResuGO — Gap Analysis Report', margin, y);
  y += 24;

  doc.setFontSize(13);
  doc.setTextColor(15, 23, 42);
  doc.text(`${input.jobTitle} at ${input.company}`, margin, y);
  y += 16;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139);
  doc.text(
    `${input.location || 'Remote'} · Generated ${new Date().toLocaleDateString()}`,
    margin,
    y
  );
  y += 24;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text(
    `Overall Match: ${input.overallScore}%   |   Skills: ${input.skillsScore}%   |   Experience: ${input.experienceScore}%   |   Education: ${input.educationScore}%   |   ATS Keywords: ${input.keywordsScore}%`,
    margin,
    y
  );
  y += 22;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  const verdictLines = doc.splitTextToSize(input.gapReport.summaryVerdict, maxWidth);
  doc.text(verdictLines, margin, y);
  y += verdictLines.length * 14 + 16;

  const addSection = (title: string, items: string[]) => {
    ensureSpace(44);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(79, 70, 229);
    doc.text(title, margin, y);
    y += 16;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(30, 41, 59);
    for (const item of items) {
      const lines = doc.splitTextToSize(`• ${item}`, maxWidth);
      ensureSpace(lines.length * 14 + 6);
      doc.text(lines, margin, y);
      y += lines.length * 14 + 4;
    }
    y += 10;
  };

  addSection(
    'Matched Skills',
    input.gapReport.matchedSkills.map((s) => `${s.skill} (${s.category}): ${s.evidence}`)
  );

  addSection(
    'Missing & Partial Skills',
    [
      ...input.gapReport.partialSkills.map(
        (s) => `[Partial] ${s.skill}: ${s.gapNote}`
      ),
      ...input.gapReport.missingSkills.map(
        (s) => `[Missing - ${s.importance}] ${s.skill}: ${s.reason}`
      ),
    ]
  );

  addSection('ATS Keyword Check', [
    `Pass Likelihood: ${input.gapReport.atsCheck.atsPassLikelihood}`,
    `Missing Keywords: ${input.gapReport.atsCheck.missingKeywords.join(', ') || 'None'}`,
    ...input.gapReport.atsCheck.formattingIssues,
  ]);

  addSection(
    'Action Plan',
    input.gapReport.actionPlan.map(
      (a) =>
        `${a.gap} (${a.priority}, ~${a.estimatedHours}h) — Build: ${a.projectIdea}`
    )
  );

  addSection(
    'Honest Resume Bullet Rewrites',
    input.gapReport.bulletRewrites.map(
      (b) => `${b.section}\nBefore: ${b.original}\nAfter: ${b.improved}`
    )
  );

  const safeSlug = `${input.jobTitle}_${input.company}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_');
  doc.save(`resugo_report_${safeSlug}.pdf`);
}
