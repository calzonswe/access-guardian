import { SidebarProvider } from '@/components/ui/sidebar';
import { AppSidebar } from './AppSidebar';
import { AppHeader } from './AppHeader';

export function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <AppHeader />
          <main className="flex-1 animate-fade-in px-4 py-5 sm:px-6 sm:py-6">
            {/* Keep long tables and forms readable on very wide screens. */}
            <div className="mx-auto w-full max-w-[90rem]">
              {children}
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
