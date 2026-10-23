export interface WhatsAppMessageProps {
  studentName: string;
  lang: 'en' | 'bn';
  completedClasses: number | string;
  targetClasses: number | string;
  lastClassDate?: string;
  lastClassTopic?: string;
  dueAmount: string;
  tutorName: string;
  hasLastClass: boolean;
}

export function generateWhatsAppMessage({
  studentName,
  lang,
  completedClasses,
  targetClasses,
  lastClassDate,
  lastClassTopic,
  dueAmount,
  tutorName,
  hasLastClass,
}: WhatsAppMessageProps): string {
  const lastClassTextEn = hasLastClass ? ` (Last class: ${lastClassDate || ''}${lastClassTopic ? ` - ${lastClassTopic}` : ''})` : '';
  const lastClassTextBn = hasLastClass ? ` (শেষ ক্লাস: ${lastClassDate || ''}${lastClassTopic ? ` - ${lastClassTopic}` : ''})` : '';

  if (lang === 'bn') {
    return `আসসালামু আলাইকুম, ${studentName}-এর বর্তমান সাইকেলের ${completedClasses}/${targetClasses}টি ক্লাস সম্পন্ন হয়েছে${lastClassTextBn}। বকেয়া টিউশন ফি: ৳${dueAmount}। অনুগ্রহ করে পরিশোধের ব্যবস্থা করলে উপকৃত হব। ধন্যবাদ — ${tutorName}।`;
  }

  return `Assalamu Alaikum, ${studentName} has completed ${completedClasses}/${targetClasses} classes for the current cycle${lastClassTextEn}. Total tuition fee due: ৳${dueAmount}. Thank you — ${tutorName}.`;
}
