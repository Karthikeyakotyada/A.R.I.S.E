import ReportList from '../components/ReportList'
import Card from '../components/ui/Card'

export default function Reports() {
  return (
    <div className="py-6">
      <div className="mb-5">
        <Card>
          <h2 className="text-lg font-bold text-slate-900">Your Reports</h2>
          <p className="text-sm text-slate-500 mt-1">
            View your uploaded CBC reports and open AI insights.
          </p>
        </Card>
      </div>

      <div className="active:scale-[0.999] transition-transform duration-150">
        <ReportList />
      </div>
    </div>
  )
}

