import { jsPDF } from 'jspdf';
import {
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
} from 'docx';
import type { ParsedResumeData, ResumeBuilderConfig } from '../db/schema';
import { ACCENT_HEX, DEFAULT_BUILDER_CONFIG, SECTION_LABELS } from './templates';

export function buildResumePlainText(
  data: ParsedResumeData,
  config: ResumeBuilderConfig = DEFAULT_BUILDER_CONFIG
): string {
  const labels = SECTION_LABELS[config.targetLanguage] || SECTION_LABELS.en;
  const lines: string[] = [];

  lines.push((data.contactInfo?.name || 'Candidate Name').toUpperCase());
  lines.push(
    [
      data.contactInfo?.email,
      data.contactInfo?.phone,
      data.contactInfo?.location,
      data.contactInfo?.linkedin,
      data.contactInfo?.github,
      data.contactInfo?.portfolio,
    ]
      .filter(Boolean)
      .join(' | ')
  );

  for (const sec of config.sectionOrder) {
    if (sec === 'summary' && data.summary) {
      lines.push('', labels.summary.toUpperCase(), data.summary);
    } else if (sec === 'skills' && data.skills.length > 0) {
      lines.push('', labels.skills.toUpperCase(), data.skills.join(' · '));
    } else if (sec === 'experience' && data.experience.length > 0) {
      lines.push('', labels.experience.toUpperCase());
      for (const e of data.experience) {
        lines.push(`${e.role} — ${e.company} (${e.duration})`);
        for (const b of e.bullets) lines.push(`- ${b}`);
      }
    } else if (sec === 'projects' && data.projects.length > 0) {
      lines.push('', labels.projects.toUpperCase());
      for (const p of data.projects) {
        lines.push(`${p.name} [${p.technologies.join(', ')}]`);
        if (p.description) lines.push(`- ${p.description}`);
      }
    } else if (sec === 'education' && data.education.length > 0) {
      lines.push('', labels.education.toUpperCase());
      for (const ed of data.education) {
        lines.push(`${ed.degree} — ${ed.institution} (${ed.year})`);
      }
    } else if (sec === 'certifications' && data.certifications.length > 0) {
      lines.push('', labels.certifications.toUpperCase(), data.certifications.join(' · '));
    } else if (sec === 'languages' && data.languages && data.languages.length > 0) {
      lines.push(
        '',
        labels.languages.toUpperCase(),
        data.languages.map((l) => `${l.language} (${l.proficiency})`).join(' · ')
      );
    } else if (sec === 'awards' && data.awards && data.awards.length > 0) {
      lines.push('', labels.awards.toUpperCase());
      for (const a of data.awards) lines.push(`- ${a.title} · ${a.issuer} (${a.year})`);
    } else if (sec === 'volunteering' && data.volunteering && data.volunteering.length > 0) {
      lines.push('', labels.volunteering.toUpperCase());
      for (const v of data.volunteering) {
        lines.push(`${v.role} — ${v.organization} (${v.duration}): ${v.description}`);
      }
    } else if (sec === 'publications' && data.publications && data.publications.length > 0) {
      lines.push('', labels.publications.toUpperCase());
      for (const p of data.publications) {
        lines.push(`- ${p.title} (${p.venue}, ${p.year})`);
      }
    }
  }

  for (const custom of data.customSections || []) {
    lines.push('', custom.title.toUpperCase());
    for (const item of custom.items) {
      lines.push(`${item.heading} — ${item.subheading} (${item.date})`);
      for (const b of item.bullets) lines.push(`- ${b}`);
    }
  }

  return lines.join('\n');
}

export function exportResumeToTxt(
  data: ParsedResumeData,
  config: ResumeBuilderConfig,
  filenameSlug = 'resume'
) {
  const txt = buildResumePlainText(data, config);
  const blob = new Blob([txt], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filenameSlug}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportResumeToPdf(
  data: ParsedResumeData,
  config: ResumeBuilderConfig = DEFAULT_BUILDER_CONFIG,
  filenameSlug = 'resugo_resume'
) {
  const format = config.regionFormat === 'US' ? 'letter' : 'a4';
  const doc = new jsPDF({ unit: 'pt', format });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = config.margin === 'narrow' ? 32 : config.margin === 'wide' ? 56 : 44;
  const maxWidth = pageWidth - margin * 2;
  const lineStep = config.spacing === 'compact' ? 12.5 : config.spacing === 'relaxed' ? 16 : 14;
  const fontFamily = config.font === 'georgia' ? 'times' : config.font === 'jetbrains' ? 'courier' : 'helvetica';
  const [r, g, b] = config.atsSafeMode ? [15, 23, 42] : ACCENT_HEX[config.accentColor] || [13, 148, 136];
  const labels = SECTION_LABELS[config.targetLanguage] || SECTION_LABELS.en;

  let y = margin + 8;
  const ensureSpace = (needed = 36) => {
    if (y + needed > pageHeight - margin) {
      doc.addPage();
      y = margin + 8;
    }
  };

  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(20);
  doc.setTextColor(15, 23, 42);
  doc.text(data.contactInfo?.name || 'Candidate Name', margin, y);
  y += 18;

  doc.setFont(fontFamily, 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(71, 85, 105);
  const contactLine = [
    data.contactInfo?.email,
    data.contactInfo?.phone,
    data.contactInfo?.location,
    data.contactInfo?.linkedin,
    data.contactInfo?.github,
    data.contactInfo?.portfolio,
  ]
    .filter(Boolean)
    .join('  |  ');
  const contactWrapped = doc.splitTextToSize(contactLine, maxWidth);
  doc.text(contactWrapped, margin, y);
  y += contactWrapped.length * 13 + 10;

  const drawHeading = (heading: string) => {
    ensureSpace(34);
    doc.setFont(fontFamily, 'bold');
    doc.setFontSize(11);
    doc.setTextColor(r, g, b);
    doc.text(heading.toUpperCase(), margin, y);
    y += 4;
    doc.setDrawColor(203, 213, 225);
    doc.line(margin, y, pageWidth - margin, y);
    y += 14;
  };

  const drawParagraph = (text: string, bold = false, color: [number, number, number] = [30, 41, 59]) => {
    doc.setFont(fontFamily, bold ? 'bold' : 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...color);
    const wrapped = doc.splitTextToSize(text, maxWidth);
    ensureSpace(wrapped.length * lineStep + 4);
    doc.text(wrapped, margin, y);
    y += wrapped.length * lineStep + 3;
  };

  for (const sec of config.sectionOrder) {
    if (sec === 'summary' && data.summary) {
      drawHeading(labels.summary);
      drawParagraph(data.summary);
      y += 6;
    } else if (sec === 'skills' && data.skills.length > 0) {
      drawHeading(labels.skills);
      drawParagraph(data.skills.join(' · '));
      y += 6;
    } else if (sec === 'experience' && data.experience.length > 0) {
      drawHeading(labels.experience);
      for (const exp of data.experience) {
        drawParagraph(`${exp.role} — ${exp.company}  (${exp.duration})`, true, [15, 23, 42]);
        for (const bul of exp.bullets) {
          drawParagraph(`• ${bul}`);
        }
        y += 4;
      }
    } else if (sec === 'projects' && data.projects.length > 0) {
      drawHeading(labels.projects);
      for (const proj of data.projects) {
        drawParagraph(
          `${proj.name}${proj.technologies.length ? ` (${proj.technologies.join(', ')})` : ''}`,
          true,
          [15, 23, 42]
        );
        if (proj.description) drawParagraph(`• ${proj.description}`);
      }
      y += 4;
    } else if (sec === 'education' && data.education.length > 0) {
      drawHeading(labels.education);
      for (const edu of data.education) {
        drawParagraph(`${edu.degree} — ${edu.institution} (${edu.year})`, true, [15, 23, 42]);
      }
      y += 4;
    } else if (sec === 'certifications' && data.certifications.length > 0) {
      drawHeading(labels.certifications);
      drawParagraph(data.certifications.join(' · '));
      y += 4;
    } else if (sec === 'languages' && data.languages?.length) {
      drawHeading(labels.languages);
      drawParagraph(data.languages.map((l) => `${l.language} (${l.proficiency})`).join(' · '));
      y += 4;
    } else if (sec === 'awards' && data.awards?.length) {
      drawHeading(labels.awards);
      for (const a of data.awards) drawParagraph(`• ${a.title} — ${a.issuer} (${a.year})`);
      y += 4;
    } else if (sec === 'volunteering' && data.volunteering?.length) {
      drawHeading(labels.volunteering);
      for (const v of data.volunteering) {
        drawParagraph(`${v.role} — ${v.organization} (${v.duration}): ${v.description}`);
      }
      y += 4;
    } else if (sec === 'publications' && data.publications?.length) {
      drawHeading(labels.publications);
      for (const p of data.publications) drawParagraph(`• ${p.title} (${p.venue}, ${p.year})`);
      y += 4;
    }
  }

  for (const custom of data.customSections || []) {
    if (custom.items.length === 0) continue;
    drawHeading(custom.title);
    for (const item of custom.items) {
      drawParagraph(`${item.heading} — ${item.subheading} (${item.date})`, true, [15, 23, 42]);
      for (const bul of item.bullets) drawParagraph(`• ${bul}`);
    }
    y += 4;
  }

  doc.save(`${filenameSlug}.pdf`);
}

export async function exportResumeToDocx(
  data: ParsedResumeData,
  config: ResumeBuilderConfig = DEFAULT_BUILDER_CONFIG,
  filenameSlug = 'resugo_resume'
) {
  const labels = SECTION_LABELS[config.targetLanguage] || SECTION_LABELS.en;
  const children: Paragraph[] = [];

  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [
        new TextRun({
          text: data.contactInfo?.name || 'Candidate Name',
          bold: true,
          size: 32,
        }),
      ],
    })
  );

  const contactLine = [
    data.contactInfo?.email,
    data.contactInfo?.phone,
    data.contactInfo?.location,
    data.contactInfo?.linkedin,
    data.contactInfo?.github,
    data.contactInfo?.portfolio,
  ]
    .filter(Boolean)
    .join(' | ');

  if (contactLine) {
    children.push(
      new Paragraph({
        spacing: { after: 180 },
        children: [new TextRun({ text: contactLine, size: 20, color: '475569' })],
      })
    );
  }

  const pushHeading = (title: string) => {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 200, after: 80 },
        children: [new TextRun({ text: title.toUpperCase(), bold: true, size: 22 })],
      })
    );
  };

  for (const sec of config.sectionOrder) {
    if (sec === 'summary' && data.summary) {
      pushHeading(labels.summary);
      children.push(new Paragraph({ children: [new TextRun({ text: data.summary, size: 21 })] }));
    } else if (sec === 'skills' && data.skills.length > 0) {
      pushHeading(labels.skills);
      children.push(
        new Paragraph({ children: [new TextRun({ text: data.skills.join(' · '), size: 21 })] })
      );
    } else if (sec === 'experience' && data.experience.length > 0) {
      pushHeading(labels.experience);
      for (const exp of data.experience) {
        children.push(
          new Paragraph({
            spacing: { before: 100 },
            children: [
              new TextRun({ text: `${exp.role} — ${exp.company} `, bold: true, size: 22 }),
              new TextRun({ text: `(${exp.duration})`, size: 20, color: '64748B' }),
            ],
          })
        );
        for (const bul of exp.bullets) {
          children.push(
            new Paragraph({
              bullet: { level: 0 },
              children: [new TextRun({ text: bul, size: 20 })],
            })
          );
        }
      }
    } else if (sec === 'projects' && data.projects.length > 0) {
      pushHeading(labels.projects);
      for (const proj of data.projects) {
        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: `${proj.name}${proj.technologies.length ? ` (${proj.technologies.join(', ')})` : ''}`,
                bold: true,
                size: 21,
              }),
            ],
          })
        );
        if (proj.description) {
          children.push(
            new Paragraph({
              bullet: { level: 0 },
              children: [new TextRun({ text: proj.description, size: 20 })],
            })
          );
        }
      }
    } else if (sec === 'education' && data.education.length > 0) {
      pushHeading(labels.education);
      for (const edu of data.education) {
        children.push(
          new Paragraph({
            children: [
              new TextRun({ text: `${edu.degree} — ${edu.institution} (${edu.year})`, size: 21 }),
            ],
          })
        );
      }
    } else if (sec === 'certifications' && data.certifications.length > 0) {
      pushHeading(labels.certifications);
      children.push(
        new Paragraph({ children: [new TextRun({ text: data.certifications.join(' · '), size: 20 })] })
      );
    } else if (sec === 'languages' && data.languages?.length) {
      pushHeading(labels.languages);
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: data.languages.map((l) => `${l.language} (${l.proficiency})`).join(' · '),
              size: 20,
            }),
          ],
        })
      );
    } else if (sec === 'awards' && data.awards?.length) {
      pushHeading(labels.awards);
      for (const a of data.awards) {
        children.push(
          new Paragraph({
            bullet: { level: 0 },
            children: [new TextRun({ text: `${a.title} — ${a.issuer} (${a.year})`, size: 20 })],
          })
        );
      }
    } else if (sec === 'volunteering' && data.volunteering?.length) {
      pushHeading(labels.volunteering);
      for (const v of data.volunteering) {
        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: `${v.role} — ${v.organization} (${v.duration}): ${v.description}`,
                size: 20,
              }),
            ],
          })
        );
      }
    } else if (sec === 'publications' && data.publications?.length) {
      pushHeading(labels.publications);
      for (const p of data.publications) {
        children.push(
          new Paragraph({
            bullet: { level: 0 },
            children: [new TextRun({ text: `${p.title} (${p.venue}, ${p.year})`, size: 20 })],
          })
        );
      }
    }
  }

  for (const custom of data.customSections || []) {
    if (custom.items.length === 0) continue;
    pushHeading(custom.title);
    for (const item of custom.items) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `${item.heading} — ${item.subheading} (${item.date})`,
              bold: true,
              size: 21,
            }),
          ],
        })
      );
      for (const bul of item.bullets) {
        children.push(
          new Paragraph({
            bullet: { level: 0 },
            children: [new TextRun({ text: bul, size: 20 })],
          })
        );
      }
    }
  }

  const doc = new Document({
    sections: [{ children }],
  });

  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filenameSlug}.docx`;
  a.click();
  URL.revokeObjectURL(url);
}
