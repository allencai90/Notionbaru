import BLOG from '@/blog.config'
// [核心修复 B-1] 我们不再需要 NotionPage 或 getPostBlocks，因为我们只处理摘要
// import NotionPage from '@/components/NotionPage'
// import { getPostBlocks } from '@/lib/db/getSiteData'
import { Feed } from 'feed'
import fs from 'fs'
import path from 'path'
// import ReactDOMServer from 'react-dom/server' // 也不再需要

/**
 * [核心修复 A]
 * 清洗并生成RSS内容
 * @param {*} post
 * @returns {Promise<string>}
 */
const createFeedContent = async (post) => {
  // NotionNext生成的摘要(post.summary)中包含了图标和页面属性的HTML。
  // 我们需要将它们移除，只保留纯净的文章摘要内容。
  // 使用正则表达式匹配并替换掉这些不需要的HTML元素。
  let content = post.summary
  
  // 移除页面图标 (通常在 <div class="notion-page-icon-inline">...</div> 中)
  content = content.replace(/<div class="notion-page-icon-inline">.*?<\/div>/, '')
  
  // 移除所有属性行 (class="notion-collection-row")
  content = content.replace(/<div class="notion-collection-row">.*?<\/div>/g, '')

  // 移除 Notion 的 Callout 块中的图标，它们在 RSS 中可能显示不佳
  content = content.replace(/<div class="notion-callout" style="display: flex; align-items: flex-start; width: 100%;">.*?<div style="margin-left: 8px; width: 100%;">/s, '<div>')

  // 返回清洗后的HTML内容
  return content
}

/**
 * 生成RSS数据
 * @param {*} props
 */
export async function generateRss(props) {
  const { NOTION_CONFIG, siteInfo, latestPosts } = props
  const TITLE = siteInfo?.title
  const DESCRIPTION = siteInfo?.description
  const LINK = siteInfo?.link || BLOG.LINK
  const AUTHOR = NOTION_CONFIG?.AUTHOR || BLOG.AUTHOR
  const LANG = NOTION_CONFIG?.LANG || BLOG.LANG
  const SUB_PATH = NOTION_CONFIG?.SUB_PATH || BLOG.SUB_PATH
  const CONTACT_EMAIL = NOTION_CONFIG?.CONTACT_EMAIL || BLOG.CONTACT_EMAIL

  // 检查 feed 文件是否在 10 分钟内更新过
  const rssPath = path.resolve('./public/rss/feed.xml')
  if (isFeedRecentlyUpdated(rssPath, 10)) {
    return
  }

  console.log('[RSS订阅] 生成 /rss/feed.xml')
  const year = new Date().getFullYear()
  const feed = new Feed({
    title: TITLE,
    description: DESCRIPTION,
    link: `${LINK}/${SUB_PATH}`,
    language: LANG,
    favicon: `${LINK}/favicon.png`,
    copyright: `All rights reserved ${year}, ${AUTHOR}`,
    author: { name: AUTHOR, email: CONTACT_EMAIL, link: LINK }
  })

  const latestPostsLimited = latestPosts.slice(0, 10)
  for (const post of latestPostsLimited) {
    const content = await createFeedContent(post)

    feed.addItem({
      title: post.title,
      link: `${BLOG.LINK}/${post.slug}`,
      description: post.summary, // description 字段可以保留原始摘要，或者也用清洗后的
      
      // [核心修复 B-2] 将清洗过的内容包裹在 CDATA 中
      content: `<![CDATA[${content}]]>`,

      date: new Date(post?.publishDay)
    })
  }

  try {
    fs.mkdirSync('./public/rss', { recursive: true })
    fs.writeFileSync(rssPath, feed.rss2())
    fs.writeFileSync(path.resolve('./public/rss/atom.xml'), feed.atom1())
    fs.writeFileSync(path.resolve('./public/rss/feed.json'), feed.json1())
  } catch (error) {
    console.warn('[RSS 生成失败] 可能运行在只读文件系统，已跳过写入')
  }
}

/**
 * 检查上次更新
 * @param {*} filePath
 * @param {*} intervalMinutes
 * @returns
 */
function isFeedRecentlyUpdated(filePath, intervalMinutes = 60) {
  try {
    const stats = fs.statSync(filePath)
    return (Date.now() - stats.mtimeMs) < intervalMinutes * 60 * 1000
  } catch (error) {
    return false
  }
}
