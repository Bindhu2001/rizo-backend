import React from 'react';
import { Briefcase, FileText, History, Wallet, LogOut } from 'lucide-react-native';
import MenuListPage from '../components/MenuListPage';
import { isRevampCompany } from '../constants/Config';

// Requests tab — the employee's own requests (web ESS: My Requests). No `route` = no screen in this app version yet.
// Advance & Loan and Resignation run on the web employee login's own routes, so only DigitalOcean companies have them.
const itemsFor = (revamp) => [
  { key: 'requests.leave', title: 'Leave', note: 'Apply for leave and track your requests', route: 'Leave', Icon: Briefcase, color: '#7C3AED', bg: '#F3E5F5' },
  { key: 'requests.expenses', title: 'Expense Claims', note: 'Claim expenses and track reimbursements', route: 'Expense', Icon: FileText, color: '#E91E63', bg: '#FFEBEE' },
  { key: 'requests.regularization', title: 'Regularization', note: 'Late in / early out requests', route: 'AttendanceReg', params: { initialTab: 'LOG' }, Icon: History, color: '#FF9800', bg: '#FFF3E0' },
  { key: 'requests.advance-loan', title: 'Advance & Loan', note: 'Request a salary advance and view your loans', route: revamp ? 'EssAdvanceLoan' : null, Icon: Wallet, color: '#0EA5E9', bg: '#E0F2FE' },
  { key: 'requests.resignation', title: 'Resignation', note: 'Apply for resignation and track your request', route: revamp ? 'EssResignation' : null, Icon: LogOut, color: '#64748B', bg: '#F1F5F9' },
];

const RequestsScreen = ({ navigation, route }) => {
  const user = route.params?.user;
  return (
    <MenuListPage title="Requests" subtitle="Your requests" items={itemsFor(isRevampCompany(user?.user_id))} user={user} navigation={navigation} />
  );
};

export default RequestsScreen;
