import React from 'react';
import { CheckCircle, ClipboardList, Receipt, Wallet } from 'lucide-react-native';
import MenuListPage from '../components/MenuListPage';
import { isRevampCompany } from '../constants/Config';

// Approvals tab — your team's requests waiting on you (web ESS: Approvals). No `route` = no screen in this app
// version yet. DigitalOcean companies get the screens built on the web employee login's own routes (Ess*Screen);
// OVH companies keep the PHP-based Leave approval, and Expense / Advance & Loan aren't on their server's menus.
const itemsFor = (revamp) => [
  { key: 'approvals.leave', title: 'Leave', note: 'Team leave requests waiting on you', route: revamp ? 'EssLeaveApproval' : 'LeaveApproval', Icon: CheckCircle, color: '#16A34A', bg: '#DCFCE7' },
  { key: 'approvals.regularisation', title: 'Regularisation', note: 'Team attendance corrections to review', route: 'RegularisationApproval', Icon: ClipboardList, color: '#F97316', bg: '#FFF3E0' },
  { key: 'approvals.expense', title: 'Expense', note: 'Team expense claims to review', route: revamp ? 'EssExpenseApproval' : null, Icon: Receipt, color: '#E91E63', bg: '#FFEBEE' },
  { key: 'approvals.advance-loan', title: 'Advance & Loan', note: 'Team advance and loan requests to review', route: revamp ? 'EssAdvanceLoanApproval' : null, Icon: Wallet, color: '#0EA5E9', bg: '#E0F2FE' },
];

const ApprovalsScreen = ({ navigation, route }) => {
  const user = route.params?.user;
  return (
    <MenuListPage title="Approvals" subtitle="Your team's requests waiting on you" items={itemsFor(isRevampCompany(user?.user_id))} user={user} navigation={navigation} />
  );
};

export default ApprovalsScreen;
