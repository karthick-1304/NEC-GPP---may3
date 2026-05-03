export const SkeletonCard = () => (
  <div className="card p-6">
    <div className="skeleton h-5 w-2/3 mb-4" />
    <div className="skeleton h-3 w-1/3 mb-3" />
    <div className="skeleton h-3 w-1/2 mb-6" />
    <div className="flex gap-2">
      <div className="skeleton h-6 w-16 rounded-full" />
      <div className="skeleton h-6 w-20 rounded-full" />
    </div>
    <div className="skeleton h-9 w-full mt-5 rounded-xl" />
  </div>
);

export const SkeletonGrid = ({ count = 6 }: { count?: number }) => (
  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
    {Array.from({ length: count }).map((_, i) => <SkeletonCard key={i} />)}
  </div>
);
