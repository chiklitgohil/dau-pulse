import { getDashboardData } from '../actions';
import AdminDashboardClient from './AdminDashboardClient';

export const dynamic = 'force-dynamic';

export default async function AdminDashboard() {
  const { issues, clusters } = await getDashboardData();

  return (
    <AdminDashboardClient issues={issues} clusters={clusters} />
  );
}
