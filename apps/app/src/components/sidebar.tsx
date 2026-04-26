'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  MessageSquare,
  Video,
  Link2,
  ShieldCheck,
  Settings,
  Check,
  LogOut,
  ChevronsUpDown,
  PanelLeft,
  Plus,
} from 'lucide-react'
import { signOut, useSession } from '@/lib/auth-client'
import { useOrg } from '@/lib/org-context'
import { Avatar, AvatarFallback } from '@kodi/ui/components/avatar'
import { BrandLogo } from '@kodi/ui/components/brand-logo'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@kodi/ui/components/dropdown-menu'
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarInset, SidebarRail, useSidebar } from '@kodi/ui/components/sidebar'

const navItems = [
  { href: '/chat', label: 'Chat', icon: MessageSquare },
  { href: '/meetings', label: 'Meetings', icon: Video },
  { href: '/integrations', label: 'Integrations', icon: Link2 },
  { href: '/approvals', label: 'Approvals', icon: ShieldCheck },
]

function OrgAvatar({ org, size = 'sm' }: { org: { orgName: string; orgImage?: string | null }; size?: 'sm' | 'md' }) {
  const initial = org.orgName[0]?.toUpperCase() ?? 'K'
  const cls = size === 'md'
    ? 'flex aspect-square size-8 shrink-0 items-center justify-center rounded-lg overflow-hidden bg-sidebar-primary text-sidebar-primary-foreground'
    : 'flex size-6 shrink-0 items-center justify-center rounded-md border overflow-hidden'

  if (org.orgImage) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={org.orgImage} alt={org.orgName} className={cls + ' object-cover'} />
    )
  }
  return (
    <div className={cls}>
      <span className={size === 'md' ? 'text-xs font-bold' : 'text-[10px] font-bold'}>{initial}</span>
    </div>
  )
}

function OrgSwitcher() {
  const { orgs, activeOrg, setActiveOrg } = useOrg()
  const router = useRouter()

  if (orgs.length === 0) return null

  const OrgDropdownContent = (
    <DropdownMenuContent
      className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
      align="start"
      side="bottom"
      sideOffset={4}
    >
      <DropdownMenuLabel className="text-xs text-muted-foreground">
        Workspaces
      </DropdownMenuLabel>
      {orgs.map((org) => (
        <DropdownMenuItem
          key={org.orgId}
          onClick={() => setActiveOrg(org)}
          className="gap-2 p-2"
        >
          <OrgAvatar org={org} size="sm" />
          {org.orgName}
          {org.orgId === activeOrg?.orgId && (
            <Check className="ml-auto h-4 w-4 shrink-0" />
          )}
        </DropdownMenuItem>
      ))}
      <DropdownMenuSeparator />
      <DropdownMenuItem
        className="gap-2 p-2"
        onClick={() => router.push('/new-workspace')}
      >
        <div className="flex size-6 items-center justify-center rounded-md border border-dashed">
          <Plus className="size-3" />
        </div>
        <span>Create workspace</span>
      </DropdownMenuItem>
    </DropdownMenuContent>
  )

  if (orgs.length === 1 && activeOrg) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <SidebarMenuButton
                size="lg"
                className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                tooltip={activeOrg.orgName}
              >
                <OrgAvatar org={activeOrg} size="md" />
                <div className="grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
                  <span className="truncate font-medium">{activeOrg.orgName}</span>
                </div>
                <ChevronsUpDown className="ml-auto size-4 group-data-[collapsible=icon]:hidden" />
              </SidebarMenuButton>
            </DropdownMenuTrigger>
            {OrgDropdownContent}
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>
    )
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
              tooltip={activeOrg?.orgName ?? 'Workspaces'}
            >
              <OrgAvatar org={activeOrg ?? { orgName: 'K' }} size="md" />
              <div className="grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
                <span className="truncate font-medium">
                  {activeOrg?.orgName ?? 'Select workspace'}
                </span>
              </div>
              <ChevronsUpDown className="ml-auto size-4 group-data-[collapsible=icon]:hidden" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          {OrgDropdownContent}
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}

function UserMenu() {
  const { data: session } = useSession()
  const router = useRouter()

  const initials =
    session?.user?.name?.[0]?.toUpperCase() ??
    session?.user?.email?.[0]?.toUpperCase() ??
    '?'

  async function handleSignOut() {
    await signOut()
    router.push('/login')
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex h-12 w-full items-center gap-2 rounded-md px-2 text-left text-sm outline-none transition-[width,height,padding,background-color,color] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground group-data-[collapsible=icon]:h-8 group-data-[collapsible=icon]:w-8 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0"
            >
              <Avatar className="h-8 w-8 shrink-0 rounded-lg">
                <AvatarFallback className="rounded-lg text-[10px] font-medium">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
                <span className="truncate font-medium">
                  {session?.user?.name ?? 'User'}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {session?.user?.email}
                </span>
              </div>
              <ChevronsUpDown className="ml-auto size-4 group-data-[collapsible=icon]:hidden" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
            side="top"
            align="start"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                <Avatar className="h-8 w-8 rounded-lg">
                  <AvatarFallback className="rounded-lg text-[10px] font-medium">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">
                    {session?.user?.name ?? 'User'}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {session?.user?.email}
                  </span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/settings" className="gap-2">
                <Settings className="size-4" />
                Settings
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => void handleSignOut()} className="gap-2">
              <LogOut className="size-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}

function AppSidebar() {
  const pathname = usePathname()
  const { toggleSidebar } = useSidebar()

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex h-12 w-full items-center gap-2 rounded-md px-2 group-data-[collapsible=icon]:h-8 group-data-[collapsible=icon]:w-8 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0">
          <span className="flex size-8 shrink-0 items-center justify-center">
            <BrandLogo
              size={28}
              showWordmark={false}
              className="size-8"
              markClassName="size-8"
            />
          </span>
          <span className="truncate text-sm font-semibold group-data-[collapsible=icon]:hidden">
            Kodi
          </span>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton onClick={toggleSidebar} tooltip="Toggle sidebar">
                  <PanelLeft />
                  <span>Collapse</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            <OrgSwitcher />
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map(({ href, label, icon: Icon }) => {
                const active =
                  pathname === href || pathname.startsWith(href + '/')
                return (
                  <SidebarMenuItem key={href}>
                    <SidebarMenuButton asChild isActive={active} tooltip={label}>
                      <Link href={href}>
                        <Icon />
                        <span>{label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <UserMenu />
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  )
}

export { AppSidebar, SidebarProvider, SidebarInset }
