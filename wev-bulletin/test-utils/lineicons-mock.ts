import React from 'react';

export const Lineicons = ({
  children,
  className,
}: {
  children?: React.ReactNode;
  className?: string;
}) => React.createElement('span', { className }, children);

// Mock all the free icons as well
export const Leaf1Solid = ({ children }: { children?: React.ReactNode }) =>
  React.createElement('span', null, children);
export const Leaf1Outlined = ({ children }: { children?: React.ReactNode }) =>
  React.createElement('span', null, children);
export const Bookmark1Solid = ({ children }: { children?: React.ReactNode }) =>
  React.createElement('span', null, children);
export const Bookmark1Outlined = ({ children }: { children?: React.ReactNode }) =>
  React.createElement('span', null, children);
export const ChevronDownSolid = ({ children }: { children?: React.ReactNode }) =>
  React.createElement('span', null, children);
export const ChevronDownOutlined = ({ children }: { children?: React.ReactNode }) =>
  React.createElement('span', null, children);
export const ChevronUpSolid = ({ children }: { children?: React.ReactNode }) =>
  React.createElement('span', null, children);
export const HeartSolid = ({ children }: { children?: React.ReactNode }) =>
  React.createElement('span', null, children);
export const Briefcase2Solid = ({ children }: { children?: React.ReactNode }) =>
  React.createElement('span', null, children);
export const LocationArrowRightSolid = ({ children }: { children?: React.ReactNode }) =>
  React.createElement('span', null, children);
export const HeartOutlined = ({ children }: { children?: React.ReactNode }) =>
  React.createElement('span', null, children);
export const BriefcaseSolid = ({ children }: { children?: React.ReactNode }) =>
  React.createElement('span', null, children);
export const Globe1Outlined = ({ children }: { children?: React.ReactNode }) =>
  React.createElement('span', null, children);
export const BricksSolid = ({ children }: { children?: React.ReactNode }) =>
  React.createElement('span', null, children);

export default Lineicons;
