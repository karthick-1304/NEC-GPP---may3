import { Link } from 'react-router-dom';
import { Sparkles, ArrowLeft } from 'lucide-react';
import { PageContainer } from '@/components/ui/PageContainer';
import { Button } from '@/components/ui/Button';

export default function ComingSoonPage({ area }: { area: string }) {
  return (
    <PageContainer>
      <div className="card p-8 sm:p-12 text-center max-w-2xl mx-auto">
        <div className="grid h-14 w-14 mx-auto place-items-center rounded-2xl bg-amber-100 text-amber-600">
          <Sparkles className="h-6 w-6" />
        </div>
        <h1 className="mt-5 text-2xl font-display font-bold text-navy-900">{area} — coming next</h1>
        <p className="mt-3 text-slate-600">
          This section ships in the next development phase. The Practice section is fully wired and ready to use right now.
        </p>
        <Link to="/practice" className="inline-block mt-6">
          <Button variant="outline" leftIcon={<ArrowLeft className="h-4 w-4" />}>Back to Practice</Button>
        </Link>
      </div>
    </PageContainer>
  );
}
